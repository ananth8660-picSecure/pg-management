$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Android = Join-Path $Root 'android'
if (!(Test-Path $Android)) { Write-Host 'android/ not found; native updater patch will be applied after Android platform is created.' -ForegroundColor Yellow; exit 0 }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$JavaDir = Join-Path $Android 'app\src\main\java\in\picsecure\pgops'
$XmlDir = Join-Path $Android 'app\src\main\res\xml'
New-Item -ItemType Directory -Force -Path $JavaDir,$XmlDir | Out-Null

$Plugin = @'
package in.picsecure.pgops;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PGUpdater")
public class PGUpdaterPlugin extends Plugin {
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

  @PluginMethod
  public void getStatus(PluginCall call) {
    JSObject result = new JSObject();
    result.put("nativeBridge", true);
    result.put("packageName", getContext().getPackageName());
    call.resolve(result);
  }

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    final String url = call.getString("url", "");
    final String expectedSha = call.getString("sha256", "").toLowerCase(Locale.ROOT).trim();
    String requestedName = call.getString("fileName", "pg-management-update.apk");
    final String safeName = requestedName.replaceAll("[^a-zA-Z0-9._-]", "_");
    if (url.isEmpty() || !url.startsWith("https://")) { call.reject("A secure HTTPS update URL is required."); return; }

    final File dir = new File(getContext().getCacheDir(), "updates");
    if (!dir.exists() && !dir.mkdirs()) { call.reject("Unable to prepare the app update folder."); return; }
    final File apk = new File(dir, safeName.endsWith(".apk") ? safeName : safeName + ".apk");

    emit(1, 0, 0, "Preparing secure update…");
    executor.execute(() -> {
      try {
        boolean validCached = apk.exists() && apk.length() > 0 && (expectedSha.isEmpty() || expectedSha.equals(sha256(apk)));
        if (!validCached) {
          if (apk.exists()) apk.delete();
          download(url, apk);
          if (!expectedSha.isEmpty()) {
            String actual = sha256(apk);
            if (!expectedSha.equals(actual)) { apk.delete(); throw new Exception("Downloaded APK failed the security hash check."); }
          }
        } else {
          emit(100, apk.length(), apk.length(), "Secure update is ready to install.");
        }
        // Keep verification, APK scanning and PackageInstaller session preparation off the
        // Android UI thread. Running these I/O-heavy steps on the UI thread freezes the
        // Capacitor WebView, so the in-app progress card cannot repaint until the system
        // installer covers/closes the app.
        openInstaller(call, apk);
      } catch (Exception e) {
        if (apk.exists() && apk.length() == 0) apk.delete();
        call.reject(e.getMessage() == null ? "Unable to download the app update." : e.getMessage());
      }
    });
  }

  private void download(String source, File out) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
    connection.setConnectTimeout(8000);
    connection.setReadTimeout(30000);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
    int status = connection.getResponseCode();
    if (status < 200 || status >= 300) throw new Exception("Update download failed (HTTP " + status + ").");
    long total = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N ? connection.getContentLengthLong() : connection.getContentLength();
    emit(1, 0, total, "Connected. Downloading secure update…");
    try (InputStream in = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(out)) {
      byte[] buffer = new byte[64 * 1024]; long downloaded = 0; int read; int last = -1;
      while ((read = in.read(buffer)) != -1) {
        output.write(buffer, 0, read); downloaded += read;
        int percent = total > 0 ? (int)Math.max(1, Math.min(98, (downloaded * 98L) / total)) : 1;
        if (percent != last) { last = percent; emit(percent, downloaded, total, total > 0 ? "Downloading secure update…" : "Downloading secure update…"); }
      }
      output.flush();
    } finally { connection.disconnect(); }
    emit(99, out.length(), out.length(), "Download complete. Verifying update…");
  }

  private void openInstaller(PluginCall call, File apk) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (getActivity() != null) getActivity().runOnUiThread(() -> getContext().startActivity(settings));
        else getContext().startActivity(settings);
        JSObject result = new JSObject(); result.put("status", "permission_required"); call.resolve(result); return;
      }
      // Parse and validate the APK before handing it to Android. This makes package/signing
      // errors explicit instead of surfacing as the generic "problem parsing package" dialog.
      emit(98, apk.length(), apk.length(), "Download complete. Scanning update package…");
      // Give the WebView a real frame before the Android installer can cover the app.
      // Without this short worker-thread dwell some OEMs display the installer first and
      // only paint the queued Scan/Verify states after the user presses Back.
      SystemClock.sleep(360);
      PackageManager pm = getContext().getPackageManager();
      int signingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
      PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), signingFlags);
      if (archive == null || archive.packageName == null) {
        apk.delete();
        throw new Exception("Downloaded update is not a valid Android APK. Please retry the update.");
      }
      if (!getContext().getPackageName().equals(archive.packageName)) {
        apk.delete();
        throw new Exception("Downloaded APK package does not match PG Management.");
      }

      emit(99, apk.length(), apk.length(), "Package scan passed. Verifying signature and version…");
      SystemClock.sleep(420);
      PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), signingFlags);
      String installedSigner = signerSha256(installed);
      String archiveSigner = signerSha256(archive);
      if (installedSigner.isEmpty() || archiveSigner.isEmpty() || !installedSigner.equals(archiveSigner)) {
        apk.delete();
        throw new Exception("This update was signed with a different app key. PG Management cannot update this installed build in place.");
      }
      long installedCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? installed.getLongVersionCode() : installed.versionCode;
      long archiveCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? archive.getLongVersionCode() : archive.versionCode;
      if (archiveCode <= installedCode) {
        apk.delete();
        throw new Exception("The downloaded update is not newer than the installed PG Management build.");
      }

      emit(100, apk.length(), apk.length(), "Scan complete. Preparing Android installation…");
      // Keep the in-app 100% / preparing state visible before handing focus to Android.
      SystemClock.sleep(650);

      // Use Android PackageInstaller sessions instead of handing a cache URI to an OEM
      // package parser. The verified APK bytes are streamed directly into a system install
      // session, which avoids the recurring Motorola/OEM "problem parsing package" path.
      PackageInstaller installer = pm.getPackageInstaller();
      PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
      params.setAppPackageName(getContext().getPackageName());
      int sessionId = installer.createSession(params);
      PackageInstaller.Session session = installer.openSession(sessionId);
      try (FileInputStream input = new FileInputStream(apk); OutputStream output = session.openWrite("base.apk", 0, apk.length())) {
        byte[] buffer = new byte[128 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        session.fsync(output);
      }

      Intent statusIntent = new Intent(getContext(), MainActivity.class);
      statusIntent.setAction(getContext().getPackageName() + ".PG_UPDATE_INSTALL_STATUS");
      statusIntent.setPackage(getContext().getPackageName());
      statusIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) piFlags |= PendingIntent.FLAG_MUTABLE;
      // Deliver PackageInstaller status back into the already-open MainActivity. This avoids
      // OEMs placing a transparent helper Activity behind the WebView task. MainActivity receives
      // STATUS_PENDING_USER_ACTION in onNewIntent() and launches Android's confirmation directly
      // from the visible foreground Activity, so the Update / Cancel sheet appears immediately.
      PendingIntent pending = PendingIntent.getActivity(getContext(), sessionId, statusIntent, piFlags);
      session.commit(pending.getIntentSender());
      session.close();

      JSObject result = new JSObject(); result.put("status", "installer_opened"); call.resolve(result);
    } catch (Exception e) { call.reject(e.getMessage() == null ? "Unable to open Android installer." : e.getMessage()); }
  }

  @SuppressWarnings("deprecation")
  public static boolean handleInstallerIntent(android.app.Activity activity, Intent intent) {
    if (activity == null || intent == null || !intent.hasExtra(PackageInstaller.EXTRA_STATUS)) return false;

    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
      if (confirm == null) return true;

      // Keep the Android confirmation attached to the CURRENT PG Management task.
      // PackageInstaller/OEM intents can arrive carrying task-affecting flags. Clearing only
      // NEW_TASK was not enough on every device; NEW_DOCUMENT/MULTIPLE_TASK/CLEAR_TASK can
      // still make the confirmation look like a separate app and can leave it behind the WebView.
      final int taskFlags = Intent.FLAG_ACTIVITY_NEW_TASK
          | Intent.FLAG_ACTIVITY_NEW_DOCUMENT
          | Intent.FLAG_ACTIVITY_MULTIPLE_TASK
          | Intent.FLAG_ACTIVITY_CLEAR_TASK
          | Intent.FLAG_ACTIVITY_TASK_ON_HOME
          | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT;
      confirm.setFlags(confirm.getFlags() & ~taskFlags);
      confirm.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      activity.runOnUiThread(() -> activity.getWindow().getDecorView().postDelayed(() -> {
        try {
          // startActivityForResult keeps the system Update/Cancel sheet visually anchored to
          // the foreground PG Management activity instead of spawning a detached task.
          activity.startActivityForResult(confirm, 9107);
        } catch (Throwable first) {
          try { activity.startActivity(confirm); } catch (Throwable ignored) {}
        }
      }, 120));
      return true;
    }

    if (status == PackageInstaller.STATUS_SUCCESS) {
      Intent complete = new Intent(activity, PGUpdateCompleteActivity.class);
      complete.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      try { activity.startActivity(complete); } catch (Throwable ignored) {}
      return true;
    }

    return true;
  }

  private void emit(int percent, long downloaded, long total, String status) {
    JSObject event = new JSObject(); event.put("percent", percent); event.put("downloaded", downloaded); event.put("total", total); event.put("status", status);
    if (getActivity() != null) getActivity().runOnUiThread(() -> notifyListeners("downloadProgress", event));
  }

  private String signerSha256(PackageInfo info) throws Exception {
    Signature[] signatures;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      if (info.signingInfo == null) return "";
      signatures = info.signingInfo.hasMultipleSigners() ? info.signingInfo.getApkContentsSigners() : info.signingInfo.getSigningCertificateHistory();
    } else {
      signatures = info.signatures;
    }
    if (signatures == null || signatures.length == 0) return "";
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] digest = md.digest(signatures[0].toByteArray());
    StringBuilder sb = new StringBuilder();
    for (byte b : digest) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
    return sb.toString();
  }

  private String sha256(File file) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    try (FileInputStream in = new FileInputStream(file)) { byte[] buffer = new byte[64 * 1024]; int read; while ((read = in.read(buffer)) != -1) md.update(buffer, 0, read); }
    StringBuilder sb = new StringBuilder(); for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff)); return sb.toString();
  }
}
'@
[System.IO.File]::WriteAllText((Join-Path $JavaDir 'PGUpdaterPlugin.java'),$Plugin,$Utf8NoBom)

# Capacitor does not automatically expose app-local Java plugins to the WebView bridge.
# Register PGUpdater explicitly and route PackageInstaller callbacks through the visible MainActivity.
$MainActivity = Join-Path $JavaDir 'MainActivity.java'
if (!(Test-Path $MainActivity)) { throw 'MainActivity.java is missing; cannot register the native updater.' }
$main = [System.IO.File]::ReadAllText($MainActivity)

# Keep the normal Capacitor lifecycle and make the patch idempotent.
if ($main -notmatch 'registerPlugin\(PGUpdaterPlugin\.class\)') {
  if ($main -match 'public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}') {
    $replacement = @'
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(PGUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    getWindow().getDecorView().post(() -> PGUpdaterPlugin.handleInstallerIntent(this, intent));
  }
}
'@
    $main = [regex]::Replace(
      $main,
      'public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}',
      $replacement,
      1
    )
  } elseif ($main -match 'public\s+void\s+onCreate\s*\(') {
    $main = [regex]::Replace(
      $main,
      '(public\s+void\s+onCreate\s*\([^\)]*\)\s*\{)',
      "`$1`r`n    registerPlugin(PGUpdaterPlugin.class);",
      1
    )
    if ($main -notmatch 'PGUpdaterPlugin\.handleInstallerIntent\(this,\s*intent\)') {
      $main = [regex]::Replace(
        $main,
        '\}\s*$',
        @'

  @Override
  protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    getWindow().getDecorView().post(() -> PGUpdaterPlugin.handleInstallerIntent(this, intent));
  }
}
'@,
        1
      )
    }
  } else {
    throw 'MainActivity.java structure is unsupported; native updater registration was not applied.'
  }
} elseif ($main -notmatch 'PGUpdaterPlugin\.handleInstallerIntent\(this,\s*intent\)') {
  $main = [regex]::Replace(
    $main,
    '\}\s*$',
    @'

  @Override
  protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    getWindow().getDecorView().post(() -> PGUpdaterPlugin.handleInstallerIntent(this, intent));
  }
}
'@,
    1
  )
}
[System.IO.File]::WriteAllText($MainActivity,$main,$Utf8NoBom)

$StatusActivity = @'
package in.picsecure.pgops;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Bundle;

public class PGUpdateStatusActivity extends Activity {
  private static final int REQUEST_INSTALL_CONFIRMATION = 9107;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    handle(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handle(intent);
  }

  @SuppressWarnings("deprecation")
  private void handle(Intent intent) {
    if (intent == null) { finish(); return; }
    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
      if (confirm == null) { finish(); return; }

      // The confirmation must be launched from this foreground Activity and in the SAME task.
      // FLAG_ACTIVITY_NEW_TASK was the reason the OEM installer dialog could sit behind
      // PG Management and only become visible after Back was pressed.
      confirm.setFlags(confirm.getFlags() & ~Intent.FLAG_ACTIVITY_NEW_TASK);
      try {
        startActivityForResult(confirm, REQUEST_INSTALL_CONFIRMATION);
      } catch (Throwable first) {
        // Safe OEM fallback: still keep it in the current task whenever possible.
        try {
          confirm.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
          startActivity(confirm);
        } catch (Throwable ignored) {
          finish();
        }
      }
      // Intentionally DO NOT finish here. This transparent Activity stays directly above
      // MainActivity so the Android Update dialog is visibly layered over PG Management.
      return;
    }

    if (status == PackageInstaller.STATUS_SUCCESS) {
      Intent complete = new Intent(this, PGUpdateCompleteActivity.class);
      complete.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      startActivity(complete);
      finish();
      return;
    }

    finish();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == REQUEST_INSTALL_CONFIRMATION) finish();
  }
}
'@
[System.IO.File]::WriteAllText((Join-Path $JavaDir 'PGUpdateStatusActivity.java'),$StatusActivity,$Utf8NoBom)

$Receiver = @'
package in.picsecure.pgops;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

public class PGUpdateInstallReceiver extends BroadcastReceiver {
  private static final String CHANNEL = "pg_update_complete";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
      if (confirm != null) {
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(confirm);
      }
      return;
    }

    if (status == PackageInstaller.STATUS_SUCCESS) {
      Intent complete = new Intent(context, PGUpdateCompleteActivity.class);
      complete.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      try {
        context.startActivity(complete);
      } catch (Throwable ignored) {
        showCompletionNotification(context);
      }
    }
  }

  private void showCompletionNotification(Context context) {
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("PG Management update completion");
      nm.createNotificationChannel(channel);
    }
    Intent open = new Intent(context, PGUpdateCompleteActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent pi = PendingIntent.getActivity(context, 8451, open, flags);
    android.app.Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      ? new android.app.Notification.Builder(context, CHANNEL)
      : new android.app.Notification.Builder(context);
    b.setSmallIcon(context.getApplicationInfo().icon)
      .setContentTitle("PG Management updated")
      .setContentText("Update installed successfully. Tap to open.")
      .setAutoCancel(true)
      .setContentIntent(pi);
    nm.notify(8451, b.build());
  }
}
'@
[System.IO.File]::WriteAllText((Join-Path $JavaDir 'PGUpdateInstallReceiver.java'),$Receiver,$Utf8NoBom)

$CompleteActivity = @'
package in.picsecure.pgops;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class PGUpdateCompleteActivity extends Activity {
  private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.rgb(12, 25, 54));
    getWindow().setNavigationBarColor(Color.rgb(247, 249, 253));

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setPadding(dp(28), dp(36), dp(28), dp(36));
    root.setBackgroundColor(Color.rgb(247, 249, 253));

    TextView badge = new TextView(this);
    badge.setText("✓");
    badge.setTextSize(36);
    badge.setGravity(Gravity.CENTER);
    badge.setTextColor(Color.rgb(32, 173, 121));
    root.addView(badge, new LinearLayout.LayoutParams(dp(84), dp(84)));

    TextView title = new TextView(this);
    title.setText("Update installed");
    title.setTextSize(26);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    title.setTextColor(Color.rgb(20, 31, 52));
    title.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    tp.topMargin = dp(14); root.addView(title, tp);

    TextView body = new TextView(this);
    body.setText("PG Management was updated successfully. You can open the updated app now or close this screen.");
    body.setTextSize(16);
    body.setTextColor(Color.rgb(96, 109, 132));
    body.setGravity(Gravity.CENTER);
    body.setLineSpacing(0, 1.15f);
    LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    bp.topMargin = dp(12); bp.bottomMargin = dp(28); root.addView(body, bp);

    Button open = new Button(this);
    open.setText("Open PG Management");
    open.setTextSize(16);
    open.setAllCaps(false);
    open.setOnClickListener(v -> {
      Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(launch);
      }
      finish();
    });
    root.addView(open, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

    Button close = new Button(this);
    close.setText("Close");
    close.setTextSize(16);
    close.setAllCaps(false);
    close.setOnClickListener(v -> finishAndRemoveTask());
    LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
    cp.topMargin = dp(12); root.addView(close, cp);

    setContentView(root);
  }
}
'@
[System.IO.File]::WriteAllText((Join-Path $JavaDir 'PGUpdateCompleteActivity.java'),$CompleteActivity,$Utf8NoBom)

$Paths = @'
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="pg_management_updates" path="updates/" />
</paths>
'@
[System.IO.File]::WriteAllText((Join-Path $XmlDir 'pg_updater_paths.xml'),$Paths,$Utf8NoBom)

$Manifest = Join-Path $Android 'app\src\main\AndroidManifest.xml'
if (!(Test-Path $Manifest)) { throw 'AndroidManifest.xml is missing.' }
$xml = [System.IO.File]::ReadAllText($Manifest)
if ($xml -notmatch 'android.permission.REQUEST_INSTALL_PACKAGES') {
  $xml = $xml -replace '<application', "<uses-permission android:name=`"android.permission.REQUEST_INSTALL_PACKAGES`" />`r`n    <application"
}
# R162: no alternate installer receiver/status activity is registered. PackageInstaller callbacks
# go only to the already-visible MainActivity so there is a single foreground update path.
if ($xml -notmatch 'PGUpdateCompleteActivity') {
  $activityXml = @'
        <activity
            android:name=".PGUpdateCompleteActivity"
            android:exported="false"
            android:excludeFromRecents="true"
            android:theme="@style/AppTheme.NoActionBar" />
'@
  $xml = $xml -replace '</application>', ($activityXml + '    </application>')
}
# Keep MainActivity as the single foreground task target for PackageInstaller callbacks.
$xml = [regex]::Replace($xml, '(<activity[^>]*android:name="\.MainActivity"[^>]*)(>)', {
  param($m)
  $tag = $m.Groups[1].Value
  if ($tag -match 'android:launchMode=') { $tag = [regex]::Replace($tag,'android:launchMode="[^"]+"','android:launchMode="singleTask"') }
  else { $tag += ' android:launchMode="singleTask"' }
  return $tag + $m.Groups[2].Value
}, 1)

if ($xml -notmatch 'pgupdater.fileprovider') {
  $provider = @'
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.pgupdater.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/pg_updater_paths" />
        </provider>
'@
  $xml = $xml -replace '</application>', ($provider + '    </application>')
}
[System.IO.File]::WriteAllText($Manifest,$xml,$Utf8NoBom)
Write-Host 'Native in-app updater configured with same-task PackageInstaller confirmation. Android Update dialog opens immediately over PG Management.' -ForegroundColor Green
