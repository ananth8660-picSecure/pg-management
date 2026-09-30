$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

npm run build
if (!(Test-Path (Join-Path $Root 'android'))) {
  npx cap add android
  if ($LASTEXITCODE -ne 0) { throw 'Failed to add Android platform.' }
} else {
  Write-Host 'android/ already exists; keeping the existing native project.' -ForegroundColor DarkGray
}
powershell -ExecutionPolicy Bypass -File scripts/apply-firebase-android-production.ps1
if ($LASTEXITCODE -ne 0) { Write-Host 'Native FCM config not applied yet; Android app can still be initialized, but production push will not work until google-services.json is added.' -ForegroundColor Yellow }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
powershell -ExecutionPolicy Bypass -File scripts/apply-android-branding.ps1
powershell -ExecutionPolicy Bypass -File scripts/apply-native-updater.ps1
npm run android:assets
if ($LASTEXITCODE -ne 0) { throw 'Android asset generation failed.' }
powershell -ExecutionPolicy Bypass -File scripts/apply-android-system-bars.ps1
