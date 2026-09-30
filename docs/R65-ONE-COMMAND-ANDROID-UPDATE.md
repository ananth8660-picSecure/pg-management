# R65 — One-command Android release/update pipeline

After the one-time Android/signing setup, future PG Management Android releases are published with one command from the project root:

```bat
npm run release:android
```

The command automatically:

1. bumps the patch version in `package.json`;
2. increments Android `versionCode` and aligns `versionName`;
3. builds Angular;
4. syncs Capacitor;
5. regenerates Android app icon/splash assets;
6. builds the signed `assembleRelease` APK with the permanent keystore;
7. calculates the APK SHA-256;
8. copies the APK to `public/releases/` and `dist/.../releases/`;
9. generates a live `app-release.json` containing the new version, APK URL and hash;
10. copies the finished APK + manifest into local `release/`;
11. deploys Firebase Hosting.

Installed Android apps check `https://mana-pg.web.app/app-release.json` on launch and whenever the app returns to the foreground. A higher Android `versionCode` opens the premium update modal. `Update now` opens the signed APK. Android still requires the user to approve installation; normal apps cannot silently replace themselves.

## Custom release notes

```bat
powershell -ExecutionPolicy Bypass -File scripts/release-android.ps1 -Notes "Resident uploads, notification fixes and UI improvements."
```

## Mandatory update

```bat
npm run release:android:mandatory
```

This publishes a release whose minimum version is the new build, so older installed builds cannot dismiss the update card.

## Build without publishing

```bat
powershell -ExecutionPolicy Bypass -File scripts/release-android.ps1 -SkipDeploy
```

The APK is produced under `release/`, but installed users will not see it until Firebase Hosting is deployed.

## One-time requirements

- `android/` must exist (`npm run android:init` once).
- `android/pgops-release.jks` and `android/keystore.properties` must exist (`npm run android:release:prepare` once).
- The permanent keystore must be backed up securely and reused forever for updates to the same installed app.
- Firebase CLI must be installed and logged in for automatic publishing.

## Security

The keystore and `keystore.properties` are ignored by Git. Never commit them. The release manifest contains only public release metadata and the APK SHA-256; it contains no signing secrets.
