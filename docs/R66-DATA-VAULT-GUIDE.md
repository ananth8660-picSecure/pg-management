# PG Management R66 — Data Vault & Recovery

Owner account menu → **Data Vault & Recovery**.

## Export
Click **Download Professional ZIP**. The generated backup includes tenant Firestore data, CSV summaries and available secure R2-backed attachment copies.

## Read from USB / external disk
Click **Choose backup ZIP** and select the saved ZIP from the operating system's file picker. On Android/PWA, connected USB storage appears through the system Files picker when Android exposes it. The viewer is read-only and does not restore data to Firebase.

## Delete active PG workspace
Use **Start Secure Delete**. Complete Owner password verification, type the exact confirmation phrase, then enter the device PIN. The app removes referenced R2 files and calls the secured Firebase Function to recursively delete the active tenant workspace. Other PGs and unrelated Firebase Auth accounts are not deleted.

## Deploy
```
npm install
npm run build
npm run functions:build
firebase deploy --only functions,firestore:rules,hosting
```
