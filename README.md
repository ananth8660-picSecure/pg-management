# PG Management

Secure multi-tenant PG / hostel operations platform built with Angular, Firebase and Cloudflare R2.

## Core modules

- Owner / Manager role-based access
- Blocks, floors, rooms and bed vacancy
- Monthly residents and daily-stay guests
- Rent, receipts, pending / overdue follow-up
- Staff, kitchen, maintenance, assets, utilities, expenses and vendors
- Secure documents and resident ID proofs
- Audit logs and push notifications
- Super Owner platform controls
- Responsive desktop, tablet and mobile experience

## Architecture

- **Angular 20** — frontend application
- **Firebase Authentication** — sign-in and session management
- **Cloud Firestore** — structured tenant data, permissions and operational records
- **Firebase Cloud Functions** — scheduled and event-driven backend workflows
- **Firebase Hosting** — production web hosting
- **Cloudflare R2** — encrypted binary storage for photos, ID proofs, receipts and documents
- **AES-GCM** — client / worker file encryption flow; the R2 KEK stays in Worker secrets and is never committed

## Local development

```bash
npm install
npm start
```

The Angular CLI prints the active localhost URL. If port 4200 is already in use, use the alternate port shown by the CLI.

## Production verification

```bash
npm run verify:final
```

## Deploy

Frontend only:

```bash
npm run build
firebase deploy --only hosting
```

Backend + hosting:

```bash
npm run deploy:firebase
```

Full Firebase + R2 deployment:

```bash
npm run deploy:final
```

## Security notes

- Never commit `FILE_KEK_B64`, service-account JSON, private keys or `.dev.vars`.
- Firebase Web configuration is intentionally present in the client; authorization is enforced by Firebase Auth, Firestore Security Rules and backend permission checks.
- Binary files are not stored in Firebase Storage. Firebase Storage remains deny-all for application media.
- Configure the public Firebase Web Push VAPID key in `src/environments/environment.ts` before enabling production web push.
- Configure App Check separately before enabling enforcement.

## Branch strategy

- `main` — production-ready / deployable source
- `staging` — integration and validation before promotion to `main`

See `docs/GIT-BRANCHING.md` for the recommended workflow.
