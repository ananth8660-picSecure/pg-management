# R63 — Capacitor Android foundation + safe APK update flow

## What was added
- Capacitor 8 Android-ready project configuration (`in.picsecure.pgops`).
- Existing Angular/PWA remains the single UI codebase.
- Native-only release checker. It does not run in normal web/PWA mode.
- Premium update dialog with optional mandatory-update mode.
- Hosted `app-release.json` release manifest.
- Safe handoff to Android/browser for APK download; Android still requires the user to approve installation.
- Build/sync/open scripts for Android Studio.

## First Android generation
Run these from the project root after Node dependencies can be installed:

```text
npm install
npm run build
npm run cap:add:android
npm run cap:sync
npm run cap:open
```

Do `cap:add:android` only once. After that, use `npm run android:open` for normal builds.

## Release manifest
Firebase Hosting publishes `public/app-release.json` to:

`https://mana-pg.web.app/app-release.json`

It intentionally starts with `enabled:false`, so no user sees a broken update prompt before the first signed APK exists.

For a release:
1. Increase `version` and `versionCode` in `src/environments/environment.ts` and native Android versionCode/versionName.
2. Build/sign the APK with the SAME signing key used for all previous releases.
3. Publish the APK at a stable HTTPS URL (GitHub Release asset or controlled Firebase/CDN download URL).
4. Set `app-release.json` with `enabled:true`, the higher versionCode, APK URL, release notes and optional SHA-256.
5. Deploy Hosting.

## Important Android rule
A normal Android app cannot silently replace itself. PG Management can detect a newer APK and show the premium update prompt, then open the trusted APK download/install flow. Android asks the user to confirm installation. Silent updates require managed/device-owner infrastructure or Play Store managed update mechanisms.

## Firebase native push
The existing web/PWA FCM flow remains untouched. Native Android FCM should be wired only after the Firebase Android app is registered and its real `google-services.json` is available. Do not fabricate that file.

## Verification status
The source changes are isolated so web/PWA behavior does not depend on Capacitor at runtime. Full native project generation was not completed in this environment because dependency installation timed out; therefore no APK is claimed as built or device-tested in R63.
