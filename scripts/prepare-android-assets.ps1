$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AndroidRes = Join-Path $Root 'android\app\src\main\res'
$Resources = Join-Path $Root 'resources'
$IconSource = Join-Path $Root 'app-icon-1024.png'
$SplashSource = Join-Path $Root 'splash-2732.png'
$ForegroundSource = Join-Path $Root 'app-icon-foreground-1024.png'
$BackgroundSource = Join-Path $Root 'app-icon-background-1024.png'
if (!(Test-Path $AndroidRes)) { throw 'Android resources folder is missing. Run cap sync first.' }
if (!(Test-Path $IconSource)) { throw 'app-icon-1024.png is missing.' }
if (!(Test-Path $SplashSource)) { throw 'splash-2732.png is missing.' }
New-Item -ItemType Directory -Force -Path $Resources | Out-Null
Copy-Item $IconSource (Join-Path $Resources 'icon-only.png') -Force
if (Test-Path $ForegroundSource) { Copy-Item $ForegroundSource (Join-Path $Resources 'icon-foreground.png') -Force }
if (Test-Path $BackgroundSource) { Copy-Item $BackgroundSource (Join-Path $Resources 'icon-background.png') -Force }
Copy-Item $SplashSource (Join-Path $Resources 'splash.png') -Force
Copy-Item $SplashSource (Join-Path $Resources 'splash-dark.png') -Force
# Remove only generated branding outputs so Android cannot reuse stale launcher/splash files.
Get-ChildItem $AndroidRes -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  Get-ChildItem $_.FullName -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^ic_launcher(_round|_foreground)?\.(png|webp|xml)$' -or $_.Name -eq 'splash.png'
  } | Remove-Item -Force -ErrorAction SilentlyContinue
}
Write-Host 'Fresh centered PG Management launcher/adaptive icon + splash sources prepared; stale generated branding removed.' -ForegroundColor Green
