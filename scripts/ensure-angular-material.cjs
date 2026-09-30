const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'package.json'));
const requiredPackages = [
  '@angular/material/package.json',
  '@angular/cdk/package.json',
  '@angular/animations/package.json',
];

function getMissing() {
  return requiredPackages.filter((name) => {
    try {
      req.resolve(name);
      return false;
    } catch {
      return true;
    }
  });
}

const missing = getMissing();
if (!missing.length) {
  console.log('[PG Management] Angular Material runtime verified.');
  process.exit(0);
}

console.log('[PG Management] Missing Angular Material runtime detected. Installing compatible Angular 20 packages once...');

const installArgs = [
  'install',
  '--no-audit',
  '--no-fund',
  '--save',
  '@angular/material@20.2.14',
  '@angular/cdk@20.2.14',
  '@angular/animations@20.3.16',
];

let result;
if (process.platform === 'win32') {
  // .cmd files cannot be spawned reliably with shell:false on every Windows/Node combination.
  // Run npm through cmd.exe explicitly so `npm start` works from normal Command Prompt/PowerShell.
  const comspec = process.env.ComSpec || 'cmd.exe';
  const command = ['npm', ...installArgs].join(' ');
  result = spawnSync(comspec, ['/d', '/s', '/c', command], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
} else {
  result = spawnSync('npm', installArgs, {
    cwd: root,
    stdio: 'inherit',
  });
}

if (result.error) {
  console.error('[PG Management] Unable to start npm dependency repair:', result.error.message);
  console.error('[PG Management] Run this once manually: npm install');
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[PG Management] Angular Material dependency repair failed. Run `npm install` once, then retry `npm start`.');
  process.exit(result.status || 1);
}

const stillMissing = getMissing();
if (stillMissing.length) {
  console.error('[PG Management] Required packages are still unavailable:', stillMissing.join(', '));
  console.error('[PG Management] Run `npm install` once, then retry `npm start`.');
  process.exit(1);
}

console.log('[PG Management] Angular Material/CDK/animations installed and verified.');
