# Real data switch — Firebase + Cloudflare R2

PG Ops pages do not call Firebase or R2 directly. Providers are selected in one file:

`src/app/config/app-config.ts`

## Current mode

```ts
dataProvider: 'demo'
fileProvider: 'demo'
```

This keeps seeded data and browser-local persistence enabled so the complete UI can be tested without cloud credentials.

## Production target

```ts
dataProvider: 'firebase'
fileProvider: 'r2'
```

Then add the Firebase Web App values in `src/environments/environment.ts` and configure the trusted R2 upload API URL in `APP_CONFIG.r2.apiBaseUrl`.

## Responsibility split

- Firebase Authentication: Owner / Manager sign-in.
- Cloud Firestore: blocks, floors, rooms, beds, residents, stays, payments, operations and audit metadata.
- Cloudflare R2: resident photos, Aadhaar/ID proofs, payment receipts and other documents.
- Trusted Worker/backend: creates short-lived signed R2 upload/download URLs. Never put R2 secret keys in Angular code.

## Why this is reusable

Pages depend on `StoreService` and `FileStorageService`; they do not depend on a vendor SDK. That keeps provider changes isolated and makes later migrations or storage changes much smaller.
