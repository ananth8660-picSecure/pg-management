$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $Root 'config\firebase\production\google-services.json'
$Android = Join-Path $Root 'android'
$Target = Join-Path $Android 'app\google-services.json'
if (!(Test-Path $Android)) { Write-Host 'android/ not found yet; Firebase Android production config will be copied after Android is initialized.' -ForegroundColor Yellow; exit 0 }
if (!(Test-Path $Source)) {
  Write-Host 'Production google-services.json is missing.' -ForegroundColor Yellow
  Write-Host 'Download it from Firebase Console for Android package in.picsecure.pgops and save it to config/firebase/production/google-services.json.' -ForegroundColor Yellow
  exit 2
}
$raw = Get-Content $Source -Raw | ConvertFrom-Json
$packages = @($raw.client | ForEach-Object { $_.client_info.android_client_info.package_name })
if ($packages -notcontains 'in.picsecure.pgops') { throw 'google-services.json does not contain Android package in.picsecure.pgops.' }
Copy-Item $Source $Target -Force
Write-Host 'Production Firebase Android config applied.' -ForegroundColor Green
