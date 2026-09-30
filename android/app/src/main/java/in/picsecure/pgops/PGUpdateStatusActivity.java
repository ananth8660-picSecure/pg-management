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