param(
  [switch]$CreateNewKey
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Android = Join-Path $Root 'android'
if (!(Test-Path $Android)) { throw 'android/ does not exist. Run: npm run android:init' }

$Keystore = Join-Path $Android 'pgops-release.jks'
$Props = Join-Path $Android 'keystore.properties'
$GradleHook = Join-Path $Android 'release-signing.gradle'
$AppGradle = Join-Path $Android 'app\build.gradle'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (!(Test-Path $Keystore)) {
  if (!$CreateNewKey) {
    throw 'Production signing key is missing. For an existing published app, DO NOT generate a new key: restore android/pgops-release.jks from backup. A new key cannot update existing installs. Use -CreateNewKey only for a brand-new app identity.'
  }
  Write-Host 'Creating the FIRST permanent PG Management release signing key. KEEP THIS FILE SAFE FOREVER.' -ForegroundColor Cyan
  & keytool -genkeypair -v -keystore $Keystore -alias pgops -keyalg RSA -keysize 4096 -validity 10000
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }
}

$StorePassword = Read-Host 'Keystore password'
$KeyPassword = Read-Host 'Key password (usually same as keystore password)'
$PropsText = @"
storeFile=pgops-release.jks
storePassword=$StorePassword
keyAlias=pgops
keyPassword=$KeyPassword
"@
[System.IO.File]::WriteAllText($Props, $PropsText.TrimStart(), $Utf8NoBom)

$GradleText = @'
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (!keystorePropertiesFile.exists()) {
    throw new GradleException("Missing android/keystore.properties. Run npm run android:release:prepare")
}
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
android {
    signingConfigs {
        pgopsRelease {
            storeFile rootProject.file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.pgopsRelease
        }
    }
}
'@
[System.IO.File]::WriteAllText($GradleHook, $GradleText.TrimStart(), $Utf8NoBom)

$HookLine = "apply from: '../release-signing.gradle'"
$Current = [System.IO.File]::ReadAllText($AppGradle)
if ($Current -notmatch [regex]::Escape($HookLine)) {
  [System.IO.File]::AppendAllText($AppGradle, "`r`n$HookLine`r`n", $Utf8NoBom)
}
Write-Host 'Release signing configured.' -ForegroundColor Green
Write-Host 'BACK UP android/pgops-release.jks and the passwords. Losing them prevents future APK updates.' -ForegroundColor Yellow
