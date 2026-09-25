# R39 Full Firebase + R2 production audit

Audit scope: routes, role guards, StoreService, Firebase auth/data services, resident lifecycle, room/bed operations, payments, operational modules, reports/settings, all file inputs, Firestore rules and Cloudflare R2 Worker.

## Fixed in R39
- Production Firebase mode no longer falls back to stale browser/demo data after a cloud error.
- Production writes no longer persist operational data into the demo localStorage cache.
- Core blocks, rooms, residents, payments and floor inventory now receive realtime Firestore snapshots.
- Generic operational modules now receive realtime Firestore snapshots and support create, edit, complete and Owner-only delete.
- Documents and optional module attachments are encrypted client-side and uploaded to R2; metadata is saved in the correct tenant Firestore collection.
- R2 now supports Owner-only encrypted object deletion and module-scoped Manager file permissions.
- Resident check-in, restore and checkout use Firestore transactions to keep resident/bed state consistent.
- Settings backup now includes all tenant Firebase operational collections, not only in-memory core data.
- Settings includes an authenticated R2 health check.
- Expense deletion is Owner-only in Firestore rules, consistent with other operational modules.
- Activity Log creation/edit controls are disabled because audit records are immutable.
- Production input/file-picker styling was normalized.

## Deployment after R39
1. `firebase deploy --only firestore:rules`
2. `npm run r2:deploy`
3. `npm start`

Do not regenerate `FILE_KEK_B64`; keep the existing Cloudflare secret.

## Validation performed
- TypeScript syntax transpile audit: 30 TypeScript files, 0 syntax errors.
- Angular inline-template structural balance: PASS for div/section/article/form/label/table/button/span/nav/header/aside.
- Template event-handler resolution: PASS; no referenced local click/change/submit handler was missing.
- Firebase collection/rules matrix: PASS; every application collection has a Firestore rules block.
- Firebase Storage SDK scan: PASS; no `firebase/storage`, `uploadBytes`, or `getDownloadURL` usage exists.
- Binary input routing audit: Residents, Payments, Settings/Logo and Operations/Documents all route through `FileStorageService` -> encrypted R2.
- R2 Worker namespaces audited for residents, payments, documents, branding and every operational module attachment.

## Important architecture after R39
- Firebase Auth: identity/session only.
- Firestore: tenant-scoped structured application data and permissions.
- Cloudflare R2: encrypted binary/image/PDF/office/text objects only.
- Firebase Storage: intentionally deny-all.
- Browser localStorage: App Lock state only in production; operational Firebase data no longer falls back to the demo cache.
