$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$missing = @()
$warnings = @()
if (!(Test-Path (Join-Path $Root 'config\firebase\production\google-services.json'))) { $missing += 'config/firebase/production/google-services.json (native Android FCM)' }
$env = Get-Content (Join-Path $Root 'src\environments\environment.production.ts') -Raw
if ($env -match "vapidKey:\s*''") { $missing += 'Production Firebase Web Push VAPID public key in environment.production.ts' }
if ($env -match "appCheckSiteKey:\s*''") { $warnings += 'App Check site key is empty (recommended before enforcement).' }
if (!(Test-Path (Join-Path $Root 'android\pgops-release.jks'))) { $warnings += 'android/pgops-release.jks not present in this source copy. Keep your existing permanent signing key when merging.' }
if ($missing.Count) {
  Write-Host 'PRODUCTION CONFIG INCOMPLETE' -ForegroundColor Red
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
} else { Write-Host 'Production client configuration looks ready.' -ForegroundColor Green }
if ($warnings.Count) { Write-Host 'Warnings:' -ForegroundColor Yellow; $warnings | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow } }
Write-Host 'Server secrets are intentionally not stored in source. Verify RESEND_API_KEY in Firebase Secret Manager with: firebase functions:secrets:get RESEND_API_KEY --project mana-pg' -ForegroundColor Cyan
if ($missing.Count) { exit 2 }
