$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$GradlePath = Join-Path $Root 'android\app\build.gradle'
if (!(Test-Path $GradlePath)) { throw 'android/app/build.gradle is missing; run cap sync first.' }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$g = [System.IO.File]::ReadAllText($GradlePath)

# Safe production shrinking for the universal APK. We deliberately keep all ABIs because
# PG Management is distributed directly from its own updater and must keep working across
# supported Android devices. R8 removes unused Java/resources without changing appId/signing.
$releasePattern = '(?s)(release\s*\{)(.*?)(\n\s*\})'
$m = [regex]::Match($g, $releasePattern)
if (!$m.Success) { throw 'Could not locate buildTypes.release in android/app/build.gradle.' }
$body = $m.Groups[2].Value
if ($body -match 'minifyEnabled\s+(true|false)') {
  $body = [regex]::Replace($body, 'minifyEnabled\s+(true|false)', 'minifyEnabled true', 1)
} else {
  $body += "`r`n            minifyEnabled true"
}
if ($body -match 'shrinkResources\s+(true|false)') {
  $body = [regex]::Replace($body, 'shrinkResources\s+(true|false)', 'shrinkResources true', 1)
} else {
  $body += "`r`n            shrinkResources true"
}
if ($body -notmatch 'proguardFiles') {
  $body += "`r`n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'"
}
$replacement = $m.Groups[1].Value + $body + $m.Groups[3].Value
$g = $g.Substring(0, $m.Index) + $replacement + $g.Substring($m.Index + $m.Length)
[System.IO.File]::WriteAllText($GradlePath, $g, $Utf8NoBom)

$Proguard = Join-Path $Root 'android\app\proguard-rules.pro'
if (!(Test-Path $Proguard)) { New-Item -ItemType File -Force -Path $Proguard | Out-Null }
$p = [System.IO.File]::ReadAllText($Proguard)
$marker = '# PG Management R110 safe Capacitor/native updater keeps'
if ($p -notmatch [regex]::Escape($marker)) {
  $p += @"

$marker
# Capacitor plugins are discovered/bridged using annotations and generated metadata.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.getcapacitor.** { *; }
# App-local updater/receiver must remain reachable from MainActivity/manifest callbacks.
-keep class in.picsecure.pgops.PGUpdaterPlugin { *; }
-keep class in.picsecure.pgops.PGUpdateInstallReceiver { *; }
"@
  [System.IO.File]::WriteAllText($Proguard, $p, $Utf8NoBom)
}
Write-Host 'Android size optimization applied: R8 minify + resource shrinking enabled; universal ABI compatibility retained.' -ForegroundColor Green
