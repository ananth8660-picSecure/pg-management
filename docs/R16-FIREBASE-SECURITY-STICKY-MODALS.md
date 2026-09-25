> **Superseded for file storage by R21.** Firebase Storage is now denied; all binaries use encrypted Cloudflare R2.

# R16 — Firebase Security + Sticky Shell + Safe Modals

## Firebase
The supplied Firebase Web App configuration is installed in `src/environments/environment.ts`.
`APP_CONFIG` now uses Firebase for data and private Firebase Storage for files.

The Firebase Web API key is a client identifier, not a server secret. Security is enforced by Firebase Authentication, Firestore Rules, Storage Rules, and App Check enforcement when enabled in Firebase Console.

## Private files
Resident photos, Aadhaar/ID proofs and payment receipts are uploaded to authenticated Firebase Storage paths. The application no longer stores long-lived public `getDownloadURL()` URLs for new uploads. Files are fetched through the authenticated Firebase SDK as private blobs and opened with short-lived in-browser blob URLs.

Firebase/GCS provides encryption at rest and Firebase traffic uses TLS in transit. A browser-hardcoded AES key is intentionally not used because it would provide false security. If application-level end-to-end encryption is required later, use a separately managed vault key/backend or KMS-backed envelope encryption.

## App Check
`environment.appCheckSiteKey` is prepared but empty. Add the App Check site key and enable enforcement in Firebase Console before public deployment.

## Role provisioning
Create Firebase Authentication users, then provision Firestore role documents manually/admin-side:

`users/{uid}`
```json
{ "name": "Owner Name", "role": "owner" }
```
or
```json
{ "name": "Manager Name", "role": "manager" }
```
Clients cannot self-create or self-promote role documents.

## Modal contract
Every modal uses three zones:
- `.modal-header` — always visible
- `.modal-body` — the only vertically scrolling region
- `.modal-footer` — always visible with action buttons

This applies to Residents, New Resident, Payments, Room/Amenities, Blocks/Floors, and generic Operations forms/details.

## App shell scroll contract
- Header: fixed flex zone
- Main content: the only page-scrolling region
- Footer: fixed flex zone, multi-color premium treatment
- Scrollbars: hidden without disabling mouse wheel, trackpad, touch, or keyboard scrolling
