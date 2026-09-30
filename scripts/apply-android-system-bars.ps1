$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Main = Join-Path $Root 'android\app\src\main\java\in\picsecure\pgops\MainActivity.java'
if (!(Test-Path (Split-Path -Parent $Main))) { Write-Host 'MainActivity folder not found yet; skipping system-bar patch.' -ForegroundColor Yellow; exit 0 }
$code = @'
package in.picsecure.pgops;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(PGUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    getWindow().setStatusBarColor(Color.rgb(15, 23, 42));
    getWindow().setNavigationBarColor(Color.rgb(238, 242, 247));
    int flags = 0;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    getWindow().getDecorView().setSystemUiVisibility(flags);
  }

  @Override
  protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    getWindow().getDecorView().post(() -> PGUpdaterPlugin.handleInstallerIntent(this, intent));
  }
}
'@
[System.IO.File]::WriteAllText($Main,$code,(New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Android system bars + native updater registration + foreground installer callback configured.' -ForegroundColor Green
