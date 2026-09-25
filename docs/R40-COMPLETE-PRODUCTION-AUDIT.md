# PG Ops R40 — Complete Production Audit & Gap Report

Date: 24 Sep 2026

## Audit scope

Reviewed the full Angular source, Firebase data layer, Firestore rules, Cloudflare R2 worker, authentication/role model, multi-tenant isolation, modal/input patterns, file upload flows, audit trail, Super Owner controls, and notification paths.

Static review footprint at this revision:
- 28 Angular/TypeScript source files under `src/app`
- 2,257+ application source lines reviewed
- 71 input controls, 23 selects, 3 textareas
- 5 file-upload entry points
- 28 explicit tenant audit actions
- 0 Firebase Storage SDK usages
- 0 native browser `alert()` / `confirm()` dialogs after R40 polish
- 0 TODO/FIXME markers in application/functions/R2 code
- Angular template tag-balance audit: PASS
- Template event-handler resolution audit: PASS

## Production data architecture

### Firebase
Firestore is the source of truth for all structured PG data:
- tenant/customer workspaces
- users and tenant membership
- blocks, floors, rooms and beds
- residents and stay history
- payments and rent metadata
- food, staff, maintenance, assets, utilities, expenses, vendors, calendar
- secure-document metadata
- notifications
- audit logs
- manager default access settings
- browser push-token registrations

### Cloudflare R2
All uploaded binary files remain outside Firebase Storage and are encrypted before R2 upload:
- resident photo
- Aadhaar / ID proof
- payment receipt
- PG logo
- document center files
- operational module attachments

R2 paths remain tenant-isolated under `pg/<tenant-id>/...` and are authorization checked by the Worker.

### Firebase Storage
Not used for application media/documents. Storage rules remain deny-all.

## R40 fixes added after the previous production audit

### Real web push notification foundation
Added Firebase Cloud Messaging support with:
- per-device FCM token registration
- tenant-isolated `pushTokens` records
- foreground browser notifications
- background notification service worker
- invalid-token cleanup
- Profile UI to enable/check push on each device
- token cleanup on normal logout

### Scheduled rent notifications
Cloud Function `dailyRentNotifications` runs at 08:00 Asia/Kolkata and generates in-app + push alerts for:
- rent due today
- overdue monthly rent
- remaining balance after partial payment

### Owner/Manager change alerts
Every recorded tenant audit action can now produce:
- an in-app notification
- an FCM push to other PG Owners and Managers who have Notifications permission

The actor who performed the change is excluded from the duplicate push.

### Super Owner → customer Owner notifications
Platform audit changes now create tenant notifications and push to PG Owners for events such as:
- customer access suspended
- customer access activated
- force customer sign-out
- Owner password reset action
- new customer PG creation

Platform access notifications bypass the tenant suspension/session cutoff only for the one non-sensitive access-status notification, so an Owner can still be informed that access was stopped.

### Server-side account creation
New Owner/Manager and new customer PG Auth users are now created by callable Cloud Functions using Firebase Admin instead of creating privileged accounts directly in the Angular browser.

If Firestore provisioning fails after Auth user creation, the new Auth user is rolled back.

### Optional Firebase App Check
App Check initialization is wired when `environment.appCheckSiteKey` is supplied. Enforcement still needs to be enabled in the Firebase Console after testing.

### Premium confirmations
Removed remaining native browser confirmation dialogs from:
- generic record deletion
- Owner/Manager password reset
- Super Owner password reset action
- Super Owner force customer sign-out

These now use application-styled confirmation modals.

## Functional matrix

### Fully wired / production data backed
- Email/password Firebase login
- persistent Firebase session
- app PIN lock
- role-based navigation and protected routes
- Super Owner creator-only platform vault
- customer PG activation/suspension/forced logout
- tenant Owner / Co-owner / Manager access
- manager page permissions
- blocks / floors / rooms / beds
- room assets and floor common inventory
- resident monthly and daily-stay lifecycle
- resident restore / checkout / room transfer
- rent and receipt recording
- monthly rent due/overdue calculation
- R2 encrypted file upload/open/delete authorization
- realtime Firestore sync for core data
- generic Firebase CRUD for operational modules
- reports / CSV / print views
- tenant audit trail
- in-app notification center
- FCM notification framework
- tenant backup JSON export

### Functional, but deliberately generic rather than specialist workflows
These modules save/edit/delete real Firestore records and support encrypted R2 attachments, but they currently use flexible generic record forms instead of deep domain-specific workflows:
- Food & Kitchen
- Staff Management
- Repairs & Maintenance
- Asset Inventory
- Utilities & Bills
- Expense Ledger
- Vendors & Purchases
- Tasks & Calendar

This is not UI-only; records persist. However, dedicated sub-features listed below remain future product depth.

## Remaining gaps / recommended next additions

### 1. Firebase Web Push certificate setup — external setup required
Code is complete, but real FCM web push cannot issue a browser token until the Firebase **Web Push VAPID public key** is added to:
`src/environments/environment.ts -> firebase.vapidKey`

This is a public key, not a secret.

### 2. Cloud Functions must be deployed
The push/account-creation backend requires the new `functions/` project to be installed and deployed. Until deployment, the new callable user-creation and server push jobs cannot run.

### 3. App Check enforcement — recommended
Client initialization is wired, but a reCAPTCHA Enterprise App Check site key must be configured and enforcement should be enabled only after verifying legitimate traffic.

### 4. Dedicated staff HR workflow — not implemented yet
Current Staff module is real CRUD, but does not yet include:
- attendance clock-in/out
- shifts
- salary calculation/payroll
- leave tracking
- staff document expiry alerts

### 5. Dedicated food/inventory engine — not implemented yet
Current Food module persists real records, but does not yet include:
- daily menu planner
- meal count by resident
- stock-in / stock-out quantities
- reorder thresholds
- wastage tracking
- per-meal cost analytics

### 6. Advanced maintenance workflow — partial/generic
Real records and attachments work, but future depth could add:
- ticket assignment
- SLA / due time
- technician/vendor assignment
- before/after photos
- recurring preventive maintenance

### 7. Utility analytics — partial/generic
Real records work, but automatic meter trend graphs, abnormal-usage alerts and bill reconciliation are not implemented yet.

### 8. SaaS subscription/billing for sold PG customers — not implemented
Super Owner can track and suspend customers, but there is no commercial billing engine yet for:
- plan name
- monthly/annual subscription amount
- invoice history
- renewal date
- grace period
- automatic expiry/suspension
- GST invoice fields

### 9. Automated encrypted backup/restore — partial
Manual tenant JSON backup exists. Missing:
- scheduled cloud backup snapshots
- point-in-time restore UI
- restore validation/dry run
- encrypted backup archive retention policy

### 10. File lifecycle cleanup — recommended
Upload rollback already removes failed uploads, but a scheduled orphan-file sweeper and retention policy are not implemented.

### 11. WhatsApp/SMS/email operational alerts — not implemented
FCM/browser push is added. SMS/WhatsApp provider integration is still separate work.

### 12. True offline/PWA data mutation queue — not implemented
The app is installable-style and has an FCM service worker, but it does not yet provide a full offline Firestore mutation queue UI or offline document cache UX.

### 13. Monitoring / production telemetry — recommended
Add centralized error/performance monitoring before selling broadly so failed Functions, Firestore permission errors and R2 failures are visible to the platform creator.

## UI review

- Global text/email/tel/number/date/select/textarea focus and disabled states: standardized.
- Password fields: styled and show/hide provided on login, Super Owner verification, customer Owner creation and PG Owner access-management confirmations.
- File inputs: premium selector styling with image preview where image content is supported.
- Modal layering: centralized viewport modal shell pattern.
- Native JavaScript confirmation dialogs: removed in R40.
- Role visibility: Creator controls only render for platform creator; tenant Owner controls only for Owners; Manager profile remains limited to personal/assigned scope.

## Push deployment checklist

1. Firebase Console → Project settings → Cloud Messaging → create/copy Web Push certificate public key.
2. Put public key in `environment.firebase.vapidKey`.
3. Install Functions dependencies: `npm run functions:install`.
4. Deploy rules + functions: `npm run deploy:backend`.
5. Redeploy the R2 Worker only if R2 code changed in the same release.
6. Start app, Profile → Push Notifications → Enable Push on This Device.
7. Test Owner and Manager on separate browsers/devices.
8. Test Due Today, Overdue, tenant audit change and Super Owner suspension notification flows.

## Overall assessment

Core PG management, Firebase persistence, tenant isolation, encrypted R2 files, role control and major workflows are now real functional systems rather than UI-only mockups. The main remaining product gaps are deeper specialist workflows (HR, inventory, maintenance, SaaS billing), automated backup/restore, telemetry and external notification channels.
