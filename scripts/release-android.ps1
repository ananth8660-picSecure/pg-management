param(
  [string]$Version = '',
  [string]$Notes = 'Performance, security and feature improvements.',
  [switch]$Mandatory,
  [switch]$SkipDeploy
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Run([string]$Command) {
  Write-Host "`n> $Command" -ForegroundColor Cyan
  cmd.exe /d /s /c $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $Command" }
}

function Parse-SemVer([string]$v) {
  $m = [regex]::Match($v, '^(\d+)\.(\d+)\.(\d+)$')
  if (!$m.Success) { throw "Version must be MAJOR.MINOR.PATCH, got: $v" }
  return @([int]$m.Groups[1].Value,[int]$m.Groups[2].Value,[int]$m.Groups[3].Value)
}

$PackagePath = Join-Path $Root 'package.json'
$Pkg = Get-Content $PackagePath -Raw | ConvertFrom-Json

$Android = Join-Path $Root 'android'
if (!(Test-Path $Android)) { throw 'android/ is missing. Run npm run android:init once.' }
$AppGradle = Join-Path $Android 'app\build.gradle'
if (!(Test-Path $AppGradle)) { throw 'android/app/build.gradle is missing.' }
if (!(Test-Path (Join-Path $Android 'pgops-release.jks'))) { throw 'Missing android/pgops-release.jks. Run npm run android:release:prepare.' }
if (!(Test-Path (Join-Path $Android 'keystore.properties'))) { throw 'Missing android/keystore.properties. Run npm run android:release:prepare.' }
Run 'powershell -ExecutionPolicy Bypass -File scripts/verify-android-release-identity.ps1'

$Gradle = [System.IO.File]::ReadAllText($AppGradle)
$InstalledVersionMatch = [regex]::Match($Gradle, 'versionName\s+"([^"]+)"')
if (!$InstalledVersionMatch.Success) { throw 'Could not find current versionName in android/app/build.gradle.' }
$CurrentSem = Parse-SemVer $InstalledVersionMatch.Groups[1].Value
if ([string]::IsNullOrWhiteSpace($Version)) {
  # The Android project is the durable release source of truth. ZIP/source replacement must never reset the app version.
  $Version = "$($CurrentSem[0]).$($CurrentSem[1]).$($CurrentSem[2] + 1)"
}
$NewSem = Parse-SemVer $Version
if (($NewSem[0] -lt $CurrentSem[0]) -or ($NewSem[0] -eq $CurrentSem[0] -and $NewSem[1] -lt $CurrentSem[1]) -or ($NewSem[0] -eq $CurrentSem[0] -and $NewSem[1] -eq $CurrentSem[1] -and $NewSem[2] -le $CurrentSem[2])) { throw "New version $Version must be greater than installed release version $($InstalledVersionMatch.Groups[1].Value)." }

$CodeMatch = [regex]::Match($Gradle, 'versionCode\s+(\d+)')
if (!$CodeMatch.Success) { throw 'Could not find versionCode in android/app/build.gradle.' }
$CurrentCode = [int]$CodeMatch.Groups[1].Value
$NewCode = $CurrentCode + 1
$Gradle = [regex]::Replace($Gradle, 'versionCode\s+\d+', "versionCode $NewCode", 1)
if ([regex]::IsMatch($Gradle, 'versionName\s+"[^"]+"')) {
  $Gradle = [regex]::Replace($Gradle, 'versionName\s+"[^"]+"', "versionName `"$Version`"", 1)
} else { throw 'Could not find versionName in android/app/build.gradle.' }
[System.IO.File]::WriteAllText($AppGradle, $Gradle, $Utf8NoBom)

# Keep package version aligned without creating a Git tag.
$Pkg.version = $Version
$PkgJson = $Pkg | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($PackagePath, $PkgJson + "`n", $Utf8NoBom)

Write-Host "PG Management Android release $Version (versionCode $NewCode)" -ForegroundColor Green

# IMPORTANT SIZE GUARD: never let a previously published APK become an Angular/public asset.
# public/** is bundled into dist and then copied into the Android WebView. Keeping the last
# APK under public/releases would make the next APK contain the previous APK inside itself,
# causing recursive growth (for example ~25 MB -> ~60 MB -> ~105 MB). Hosting release APKs
# are written only to dist AFTER the Android APK has been built.
$PublicReleaseDir = Join-Path $Root 'public\releases'
if (Test-Path $PublicReleaseDir) {
  $NestedApks = @(Get-ChildItem $PublicReleaseDir -Filter '*.apk' -File -ErrorAction SilentlyContinue)
  if ($NestedApks.Count -gt 0) {
    $NestedBytes = ($NestedApks | Measure-Object Length -Sum).Sum
    Write-Host ("Removing {0} stale hosted APK(s) from public/releases before web build ({1:N1} MB) to prevent APK-inside-APK growth." -f $NestedApks.Count, ($NestedBytes / 1MB)) -ForegroundColor Yellow
    $NestedApks | Remove-Item -Force
  }
}

Run 'npm run firebase:android:prod'
Run 'npm run build'
Run 'npx cap sync android'
Run 'powershell -ExecutionPolicy Bypass -File scripts/apply-android-branding.ps1'
Run 'powershell -ExecutionPolicy Bypass -File scripts/apply-native-updater.ps1'
Run 'powershell -ExecutionPolicy Bypass -File scripts/apply-android-size-optimization.ps1'
Run 'powershell -ExecutionPolicy Bypass -File scripts/prepare-android-assets.ps1'
Run 'npm run android:assets'
Run 'powershell -ExecutionPolicy Bypass -File scripts/apply-android-system-bars.ps1'

# Fail closed if the native updater bridge was not actually generated and registered.
$UpdaterJava = Join-Path $Android 'app\src\main\java\in\picsecure\pgops\PGUpdaterPlugin.java'
$MainJava = Join-Path $Android 'app\src\main\java\in\picsecure\pgops\MainActivity.java'
if (!(Test-Path $UpdaterJava)) { throw 'PGUpdaterPlugin.java is missing after native updater patch.' }
if (!(Test-Path $MainJava)) { throw 'MainActivity.java is missing after native updater patch.' }
$UpdaterSource = [System.IO.File]::ReadAllText($UpdaterJava)
$MainSource = [System.IO.File]::ReadAllText($MainJava)
if ($UpdaterSource -notmatch '@CapacitorPlugin\(name = "PGUpdater"\)' -or $UpdaterSource -notmatch 'void getStatus\(' -or $UpdaterSource -notmatch 'void downloadAndInstall\(') { throw 'PGUpdater native bridge verification failed.' }
if ($UpdaterSource -notmatch 'PackageInstaller.SessionParams' -or $UpdaterSource -notmatch 'session.openWrite' -or $UpdaterSource -notmatch 'session.commit' -or $UpdaterSource -notmatch 'PendingIntent.getActivity' -or $UpdaterSource -notmatch 'new Intent\(getContext\(\), MainActivity\.class\)' -or $UpdaterSource -notmatch 'handleInstallerIntent' -or $UpdaterSource -notmatch 'STATUS_PENDING_USER_ACTION' -or $UpdaterSource -notmatch 'getPackageArchiveInfo' -or $UpdaterSource -notmatch 'signerSha256' -or $UpdaterSource -notmatch 'emit\(1, 0, 0, "Preparing secure update' -or $UpdaterSource -notmatch 'startActivityForResult\(confirm, 9107\)' -or $UpdaterSource -notmatch 'FLAG_ACTIVITY_NEW_DOCUMENT' -or $UpdaterSource -notmatch 'SystemClock.sleep\(650\)') { throw 'PGUpdater PackageInstaller/progress/signing/foreground verification failed.' }
if ($MainSource -notmatch 'registerPlugin\(PGUpdaterPlugin\.class\)' -or $MainSource -notmatch 'PGUpdaterPlugin\.handleInstallerIntent\(this,\s*intent\)') { throw 'PGUpdater foreground callback is not wired into MainActivity.' }
Write-Host 'Native updater bridge verified: foreground MainActivity callback + staged in-app scan rendering + same-task PackageInstaller confirmation enabled.' -ForegroundColor Green

# Verify the build is using newly generated PG Management branding, not stale Android resources.
$LauncherIcon = Join-Path $Android 'app\src\main\res\mipmap-xxxhdpi\ic_launcher.png'
$SplashAsset = Join-Path $Android 'app\src\main\res\drawable-port-xxxhdpi\splash.png'
if (!(Test-Path $LauncherIcon)) { throw 'Fresh launcher icon was not generated.' }
if (!(Test-Path $SplashAsset)) { throw 'Fresh splash image was not generated.' }
if ((Get-Item $LauncherIcon).Length -lt 1000) { throw 'Generated launcher icon looks invalid.' }
if ((Get-Item $SplashAsset).Length -lt 1000) { throw 'Generated splash image looks invalid.' }
Write-Host 'Android branding verified: fresh app icon + splash are embedded in this APK.' -ForegroundColor Green

Run 'cd android && gradlew.bat assembleRelease'

$BuiltApk = Join-Path $Android 'app\build\outputs\apk\release\app-release.apk'
if (!(Test-Path $BuiltApk)) {
  # Some Gradle/AGP signing setups emit a variant filename (for example app-release-signed.apk).
  # Resolve the actual release APK instead of assuming one fixed filename.
  $ReleaseApkDir = Join-Path $Android 'app\build\outputs\apk\release'
  $Candidate = Get-ChildItem $ReleaseApkDir -Filter '*.apk' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$Candidate) { throw "Release APK was not found under: $ReleaseApkDir" }
  $BuiltApk = $Candidate.FullName
}

# IMPORTANT: do not pass a single-quoted Windows path through cmd.exe. cmd.exe treats the
# apostrophes as literal characters, which makes Test-Path fail even when the APK exists.
$VerifyIdentityScript = Join-Path $Root 'scripts\verify-android-release-identity.ps1'
& $VerifyIdentityScript -ApkPath $BuiltApk
if ($LASTEXITCODE -ne 0) { throw "Release identity verification failed for: $BuiltApk" }
$Hash = (Get-FileHash -Algorithm SHA256 $BuiltApk).Hash.ToLowerInvariant()
$BuiltSizeMb = [math]::Round((Get-Item $BuiltApk).Length / 1MB, 2)
$EmbeddedReleaseDir = Join-Path $Android 'app\src\main\assets\public\releases'
$EmbeddedApks = @()
if (Test-Path $EmbeddedReleaseDir) { $EmbeddedApks = @(Get-ChildItem $EmbeddedReleaseDir -Filter '*.apk' -File -ErrorAction SilentlyContinue) }
if ($EmbeddedApks.Count -gt 0) {
  throw 'Release size guard failed: an APK is embedded inside Android web assets. Delete public/releases/*.apk and rebuild.'
}
Write-Host "Release APK size after optimization: $BuiltSizeMb MB (no nested APK detected)." -ForegroundColor Green
$ApkName = "pg-management-$Version.apk"
$DistReleaseDir = Join-Path $Root 'dist\pg-ops-premium\browser\releases'
New-Item -ItemType Directory -Force -Path $DistReleaseDir | Out-Null
Get-ChildItem $DistReleaseDir -Filter '*.apk' -ErrorAction SilentlyContinue | Remove-Item -Force
# Deliberately do NOT copy the release APK into public/releases. public/** is input to the
# next Angular/Capacitor build and would embed this APK inside the next APK. The hosted
# artifact belongs only in dist, which Firebase Hosting deploys directly.
Copy-Item $BuiltApk (Join-Path $DistReleaseDir $ApkName) -Force

$Manifest = [ordered]@{
  enabled = $true
  version = $Version
  versionCode = $NewCode
  minimumVersionCode = $(if ($Mandatory) { $NewCode } else { 1 })
  title = 'PG Management update available'
  message = 'A newer secure build of PG Management is ready to install.'
  apkUrl = "https://pg.picsecure.in/releases/$ApkName"
  releaseNotes = @($Notes)
  mandatory = [bool]$Mandatory
  sha256 = $Hash
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$ManifestJson = $Manifest | ConvertTo-Json -Depth 10
$PublicManifest = Join-Path $Root 'public\app-release.json'
$DistManifest = Join-Path $Root 'dist\pg-ops-premium\browser\app-release.json'
[System.IO.File]::WriteAllText($PublicManifest, $ManifestJson + "`n", $Utf8NoBom)
[System.IO.File]::WriteAllText($DistManifest, $ManifestJson + "`n", $Utf8NoBom)

$OutDir = Join-Path $Root 'release'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ReleaseApk = Join-Path $OutDir $ApkName
Copy-Item $BuiltApk $ReleaseApk -Force
Copy-Item $PublicManifest (Join-Path $OutDir 'app-release.json') -Force

if (!$SkipDeploy) {
  if (!(Get-Command firebase -ErrorAction SilentlyContinue)) { throw 'Firebase CLI is not installed. Install/login or use -SkipDeploy.' }
  Run 'firebase deploy --only hosting'
}

Write-Host "`nRELEASE READY" -ForegroundColor Green
Write-Host "Version: $Version ($NewCode)"
Write-Host "APK: $ReleaseApk"
Write-Host "SHA256: $Hash"
if ($SkipDeploy) { Write-Host 'Hosting deploy skipped. Run firebase deploy --only hosting before expecting update prompts on installed apps.' -ForegroundColor Yellow }
else { Write-Host 'Published to Firebase Hosting. Installed Android apps will detect this release on launch/resume.' -ForegroundColor Green }
