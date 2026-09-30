param(
  [string]$ApkPath = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Android = Join-Path $Root 'android'
$AppGradle = Join-Path $Android 'app\build.gradle'
$Props = Join-Path $Android 'keystore.properties'
$LockFile = Join-Path $Root 'config\android\release-identity.json'
$ExpectedPackage = 'in.picsecure.pgops'

if (!(Test-Path $AppGradle)) { throw 'android/app/build.gradle is missing.' }
$gradle = [System.IO.File]::ReadAllText($AppGradle)
$pkg = [regex]::Match($gradle, 'applicationId\s+["'']([^"'']+)["'']')
if (!$pkg.Success) { throw 'Unable to read applicationId from android/app/build.gradle.' }
if ($pkg.Groups[1].Value -ne $ExpectedPackage) { throw "Package identity changed. Expected $ExpectedPackage but found $($pkg.Groups[1].Value). Release blocked." }

if (!(Test-Path $Props)) { throw 'Missing android/keystore.properties. Release identity cannot be verified.' }
$kv = @{}
Get-Content $Props | ForEach-Object {
  if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') { $kv[$matches[1]] = $matches[2] }
}
foreach ($key in @('storeFile','storePassword','keyAlias')) { if (!$kv.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($kv[$key])) { throw "keystore.properties missing $key." } }
$Keystore = Join-Path $Android $kv['storeFile']
if (!(Test-Path $Keystore)) { throw "Release keystore not found: $Keystore" }

$keytoolOut = & keytool -list -v -keystore $Keystore -storepass $kv['storePassword'] -alias $kv['keyAlias'] 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the production signing certificate. Check keystore password/alias.' }
$cert = [regex]::Match($keytoolOut, 'SHA256:\s*([0-9A-Fa-f:]+)')
if (!$cert.Success) { throw 'Unable to read SHA-256 signing certificate fingerprint from keystore.' }
$Fingerprint = ($cert.Groups[1].Value -replace ':','').ToLowerInvariant()

$dir = Split-Path -Parent $LockFile
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if (Test-Path $LockFile) {
  $lock = Get-Content $LockFile -Raw | ConvertFrom-Json
  if ($lock.packageName -ne $ExpectedPackage) { throw 'Release identity lock has a different package name. Release blocked.' }
  if (($lock.signingCertificateSha256 -replace ':','').ToLowerInvariant() -ne $Fingerprint) { throw 'Production signing key changed. Existing installs cannot be updated with this APK. Release blocked.' }
} else {
  $lock = [ordered]@{ packageName = $ExpectedPackage; keyAlias = $kv['keyAlias']; signingCertificateSha256 = $Fingerprint; createdAt = (Get-Date).ToUniversalTime().ToString('o') }
  $json = $lock | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($LockFile, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Created permanent release identity lock: $LockFile" -ForegroundColor Yellow
}

if (![string]::IsNullOrWhiteSpace($ApkPath)) {
  if (!(Test-Path $ApkPath)) { throw "APK not found for identity verification: $ApkPath" }
  $Sdk = $env:ANDROID_SDK_ROOT
  if ([string]::IsNullOrWhiteSpace($Sdk)) { $Sdk = $env:ANDROID_HOME }
  if ([string]::IsNullOrWhiteSpace($Sdk)) { throw 'ANDROID_SDK_ROOT/ANDROID_HOME is not set; cannot verify APK signer.' }
  $ApkSigner = Get-ChildItem (Join-Path $Sdk 'build-tools') -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (!$ApkSigner) { throw 'apksigner.bat not found in Android SDK build-tools.' }
  $verify = & $ApkSigner verify --print-certs $ApkPath 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
  $BuildToolsDir = Split-Path -Parent $ApkSigner
  $Aapt2 = Join-Path $BuildToolsDir 'aapt2.exe'
  if (Test-Path $Aapt2) {
    $badging = & $Aapt2 dump badging $ApkPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect APK package identity.' }
    $apkPackage = [regex]::Match($badging, "package:\s+name='([^']+)'")
    if (!$apkPackage.Success -or $apkPackage.Groups[1].Value -ne $ExpectedPackage) { throw 'Built APK package name changed. Release blocked.' }
  }
  $apkCert = [regex]::Match($verify, 'Signer #1 certificate SHA-256 digest:\s*([0-9A-Fa-f]+)')
  if (!$apkCert.Success) { throw 'Unable to read APK signing certificate SHA-256.' }
  if ($apkCert.Groups[1].Value.ToLowerInvariant() -ne $Fingerprint) { throw 'Built APK signer does not match the locked production signing key. Release blocked.' }
}

Write-Host "Release identity verified: package=$ExpectedPackage signer=$Fingerprint" -ForegroundColor Green
