# PG Ops production completion

The application code is provider-ready. The remaining deployment inputs are credentials and infrastructure owned by the operator.

## Required before live use
1. Create Firebase project / Web App and fill `src/environments/environment.ts`.
2. Set `APP_CONFIG.dataProvider = 'firebase'`.
3. Create Firebase Authentication users for Owner and Manager.
4. Provision `users/{uid}` documents manually or from a trusted admin backend with `role: owner` / `role: manager`. The browser cannot self-create role documents.
5. Deploy `firestore.rules` and `firestore.indexes.json`.
6. For R2 files, provide a trusted signed-upload API and set `APP_CONFIG.fileProvider = 'r2'` plus `APP_CONFIG.r2.apiBaseUrl`. Never put R2 secret keys in Angular.
7. Configure `pg.picsecure.in` in Firebase Hosting / DNS.
8. Run `npm run build` and smoke-test Owner + Manager on phone, tablet and desktop.

## Built-in safety
- Resident hard delete blocked in Firestore.
- Audit logs immutable from clients.
- Manager access is persisted in Firestore settings.
- Unknown Firebase accounts are not auto-provisioned as Manager.
- Owner can download a complete JSON backup from Settings.
- Settings shows provider/config/data-integrity readiness.
