# R64 Android Release / Branding

R64 keeps the existing Angular/PWA application and adds Android release branding and a production signing workflow without requiring Android Studio UI.

## Included
- Capacitor Android app id: `in.picsecure.pgops`
- Native splash screen held until the secure auth bootstrap is ready (5 second fail-safe)
- PG Management Android icon sources under `resources/`
- Matching PWA icons
- `@capacitor/assets` generation flow
- `@capacitor/splash-screen` native launch integration
- one-time release signing setup script
- release APK build command

## First Android setup
Run from the project root:

```bat
npm install
npm run android:init
npm run android:release:prepare
npm run android:release
```

`android:release:prepare` creates the permanent release keystore interactively. Back up `android/pgops-release.jks` and the passwords. Never commit them to Git.

## Later builds
After the Android platform and signing are configured:

```bat
npm run android:release
```

The signed APK is expected at:

`android\app\build\outputs\apk\release\app-release.apk`

## Important
A release APK can only be built on a machine/CI runner with a working Android SDK/JDK. Android Studio UI itself is not required. The same signing key must be used for every future update installed over the existing app.

## GitHub build without Android Studio
The project also includes `.github/workflows/android-release.yml`. Add these GitHub repository secrets once:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Then run **Android Release APK** from GitHub Actions, or push a tag such as `v1.25.0`. The workflow builds a signed `app-release.apk` and uploads it as an artifact; tag builds also attach it to the GitHub Release.
