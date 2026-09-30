$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Strings = Join-Path $Root 'android\app\src\main\res\values\strings.xml'
if (!(Test-Path $Strings)) {
  Write-Host 'android strings.xml not found; branding will be applied after Android platform exists.' -ForegroundColor Yellow
  exit 0
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$xml = [System.IO.File]::ReadAllText($Strings)
$xml = [regex]::Replace($xml, '<string name="app_name">.*?</string>', '<string name="app_name">PG Management</string>')
$xml = [regex]::Replace($xml, '<string name="title_activity_main">.*?</string>', '<string name="title_activity_main">PG Management</string>')
[System.IO.File]::WriteAllText($Strings, $xml, $Utf8NoBom)
Write-Host 'Android visible app name set to PG Management.' -ForegroundColor Green


$Res = Join-Path $Root 'android\app\src\main\res'
$Drawable = Join-Path $Res 'drawable'
$Values = Join-Path $Res 'values'
$Manifest = Join-Path $Root 'android\app\src\main\AndroidManifest.xml'
New-Item -ItemType Directory -Force -Path $Drawable | Out-Null
New-Item -ItemType Directory -Force -Path $Values | Out-Null
$NotifIcon = @'
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <!-- Android notification small icons must be monochrome. Keep PG identity instead of the old M glyph. -->
  <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="1.7" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M3.5,8.2 L12,3 L20.5,8.2 M5.4,7.2 V20 H18.6 V7.2"/>
  <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="1.9" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M7.2,17.4 V10.2 H10.1 C11.8,10.2 12.8,11.1 12.8,12.5 C12.8,13.9 11.8,14.8 10.1,14.8 H7.2 M16.9,11.2 C16.3,10.5 15.5,10.1 14.7,10.1 C12.7,10.1 11.3,11.7 11.3,13.8 C11.3,15.9 12.7,17.5 14.8,17.5 C15.7,17.5 16.5,17.2 17.1,16.6 V14.4 H14.9"/>
</vector>
'@
[System.IO.File]::WriteAllText((Join-Path $Drawable 'ic_stat_pg_notification.xml'),$NotifIcon,$Utf8NoBom)
$ColorsFile = Join-Path $Values 'pg_notification_colors.xml'
$Colors = @'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="pg_notification_color">#5B5CF6</color></resources>
'@
[System.IO.File]::WriteAllText($ColorsFile,$Colors,$Utf8NoBom)
if (Test-Path $Manifest) {
  $manifestText=[System.IO.File]::ReadAllText($Manifest)
  $metaIcon='<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_pg_notification" />'
  $metaColor='<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/pg_notification_color" />'
  if ($manifestText -notmatch 'com.google.firebase.messaging.default_notification_icon') { $manifestText=$manifestText -replace '</application>',"    $metaIcon`r`n</application>" }
  if ($manifestText -notmatch 'com.google.firebase.messaging.default_notification_color') { $manifestText=$manifestText -replace '</application>',"    $metaColor`r`n</application>" }
  [System.IO.File]::WriteAllText($Manifest,$manifestText,$Utf8NoBom)
}
Write-Host 'Android notification identity configured with PG Management monochrome app mark + brand accent.' -ForegroundColor Green
