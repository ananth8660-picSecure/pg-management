# Production Firebase Android config

Put the **production** Firebase Android app config here as:

`config/firebase/production/google-services.json`

Create/download it from Firebase Console for Android package:

`in.picsecure.pgops`

This file is copied into `android/app/google-services.json` by `npm run firebase:android:prod` and by the release pipeline.
Do not replace it with a config from a staging/dev Firebase project.
