const required = [
  '@capacitor/status-bar',
  '@capacitor/push-notifications',
  '@capacitor/app',
  '@capacitor/core',
  '@capacitor/splash-screen',
  'jszip'
];
let failed = false;
for (const name of required) {
  try {
    require.resolve(name + '/package.json', { paths: [process.cwd()] });
    console.log('OK ', name);
  } catch {
    failed = true;
    console.error('MISSING ', name);
  }
}
if (failed) {
  console.error('\nRun: npm install');
  process.exit(1);
}
console.log('\nRequired PG Management dependencies are installed.');
