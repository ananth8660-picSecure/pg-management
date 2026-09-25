# R21 — Encrypted R2 Vault + Owner User Management + Audit Trail

## File storage rule
Firebase is used only for Authentication and structured Firestore data. Firebase Storage is denied by `storage.rules`.

All resident photos, Aadhaar/ID proofs, payment receipts, PDFs and office/text documents go only to Cloudflare R2 bucket:

`mana-pg-management`

The browser generates a random 256-bit AES-GCM key and IV per file and encrypts the file **before upload**. The R2 Worker wraps the per-file key with a server-only KEK (`FILE_KEK_B64`) and stores only ciphertext in R2.

### Cloudflare setup (one time)
From `r2-worker/`:

```bash
npm install
npx wrangler login
npm run create:bucket
# generate a 32-byte base64 key, then:
npx wrangler secret put FILE_KEK_B64
npm run deploy
```

Then set the deployed Worker URL once in `src/app/config/app-config.ts`:

```ts
r2: {
  bucketName: 'mana-pg-management',
  apiBaseUrl: 'https://mana-pg-files.<your-account>.workers.dev',
  maxFileBytes: 15 * 1024 * 1024,
}
```

Do not place R2 Access Key IDs, Secret Access Keys, or `FILE_KEK_B64` in Angular code.

## Owner user management
Profile menu → **Profile & Access**.

Owner can create a Firebase Authentication account plus its Firestore `users/<uid>` access document in one flow. Manager permissions are stored per user. Owners always have full access.

## Audit trail
Important changes record:
- actor UID
- actor display name
- Owner/Manager role
- action
- module
- details
- server timestamp

The latest change is shown globally below the app header. Owner can see recent history in Profile & Access and Activity Log.
