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

    emit(1, 0, 0, "Preparing secure updateâ€¦");
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
    emit(1, 0, total, "Connected. Downloading secure updateâ€¦");
    try (InputStream in = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(out)) {
      byte[] buffer = new byte[64 * 1024]; long downloaded = 0; int read; int last = -1;
      while ((read = in.read(buffer)) != -1) {
        output.write(buffer, 0, read); downloaded += read;
        int percent = total > 0 ? (int)Math.max(1, Math.min(98, (downloaded * 98L) / total)) : 1;
        if (percent != last) { last = percent; emit(percent, downloaded, total, total > 0 ? "Downloading secure updateâ€¦" : "Downloading secure updateâ€¦"); }
      }
      output.flush();
    } finally { connection.disconnect(); }
    emit(99, out.length(), out.length(), "Download complete. Verifying updateâ€¦");
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
      emit(98, apk.length(), apk.length(), "Download complete. Scanning update packageâ€¦");
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

      emit(99, apk.length(), apk.length(), "Package scan passed. Verifying signature and versionâ€¦");
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

      emit(100, apk.length(), apk.length(), "Scan complete. Preparing Android installationâ€¦");
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