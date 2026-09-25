$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/ananth8660-picSecure/pg-management.git'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is not installed or is not available in PATH.'
}

if (-not (Test-Path '.git')) {
  git init
}

git branch -M main

$remote = git remote 2>$null
if ($remote -contains 'origin') {
  git remote set-url origin $Repo
} else {
  git remote add origin $Repo
}

git add .
$pending = git status --porcelain
if ($pending) {
  git commit -m 'chore: initialize PG Management production source'
}

git push -u origin main

$branches = git branch --list staging
if (-not $branches) {
  git checkout -b staging
} else {
  git checkout staging
}

git push -u origin staging
git checkout main

Write-Host ''
Write-Host 'GitHub setup complete.' -ForegroundColor Green
Write-Host 'main    -> production-ready branch'
Write-Host 'staging -> integration/testing branch'
