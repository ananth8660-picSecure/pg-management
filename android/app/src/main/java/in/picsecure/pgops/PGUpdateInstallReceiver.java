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