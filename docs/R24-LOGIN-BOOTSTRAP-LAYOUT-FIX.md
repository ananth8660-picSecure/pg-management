# R24 — Login Bootstrap + Desktop Layout Fix

- Configured creator UID can bootstrap the Super Owner profile for mana-pg.
- Bootstrap rules accept exact creator UID or configured creator email.
- Auth retries deterministic bootstrap for configured first-party accounts.
- Short desktop login screens compact automatically so the left-side content remains inside the viewport.
- R2 remains the only file/document storage provider.
- Deploy: `firebase deploy --only firestore:rules`
