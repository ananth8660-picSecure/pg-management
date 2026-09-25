# PG Ops — Final Production Audit Report (R41)

**Audit scope:** Angular application, navigation/role guards, Firebase Authentication, Firestore data/rules, Cloud Functions, FCM web push, Cloudflare R2 encrypted-file Worker, UI labels/forms/modals, sample/demo data, and deploy configuration.

**Static review coverage:** 31 TypeScript source files and approximately 3,264 application/backend/worker source lines, plus Firestore/Storage rules and Firebase hosting configuration. The final static audit reports **0 TypeScript parser errors, 0 obvious Angular template-balance errors, 0 unresolved template click/change/submit handlers, 0 Firebase Storage SDK usages, 0 native alert/confirm calls, 0 innerHTML/eval usages, and 0 non-local insecure HTTP URLs**.

> Important limitation: this is a source/static security and functionality review, not a formal third-party penetration test or a guarantee that no vulnerability can ever exist. A full browser/device regression run, Firebase Emulator security-rule tests, and dependency CVE scan should remain part of release QA.

## 1. Security & data-encryption audit

### Fixed / hardened in the final pass

- **Creator bootstrap** is restricted to the exact configured Creator Firebase UID. The old email/default-manager self-bootstrap path was removed.
- **Super Owner / Owner / Manager separation** is enforced in UI guards and Firestore rules.
- **Customer PG Owners cannot modify platform-commercial access fields** (`active`, force-logout state, sale/customer metadata) by direct Firestore calls. They can update their PG branding only.
- **An Owner cannot demote or disable their own membership** through a direct Firestore API call. This protects against accidental/self-lockout and keeps at least the acting Owner active.
- **Push tokens cannot be listed from the client.** A user can access only their own device token record; Admin Functions handle notification fan-out.
- **Audit-log actor spoofing is blocked.** Client audit records must match the authenticated membership UID/name/role.
- **Individual force logout is server-enforced** using `forceLogoutEpoch` in Firestore rules and the R2 Worker, not only a UI redirect.
- **PG-wide suspend / force logout** invalidates old sessions for Firestore and R2 access.
- **App Lock PIN** uses PBKDF2-SHA256 with a random salt and 250,000 iterations, plus failed-attempt throttling. It is a convenience device lock; Firebase Auth remains the true authentication boundary.
- **HTML/SVG/executable-style uploads are blocked.** Final file validation accepts only an explicit allow-list of image/PDF/office/text MIME types and extensions. SVG is intentionally rejected to reduce stored-XSS risk.
- Hosting has `nosniff`, clickjacking (`DENY`), referrer and browser-permission headers. The FCM service worker is no-cache.
- Firebase Storage remains **deny-all**.

### What is encrypted, and what is not

**Encrypted at application level before R2:** resident photos, Aadhaar/ID proof files, receipts, PG logos, secure documents, and operational attachments. A random 256-bit AES-GCM file key and IV are created in the browser. The R2 object body is ciphertext. The Worker wraps the file key with the Cloudflare secret `FILE_KEK_B64`; the raw key is not persisted in R2 metadata.

**Not zero-knowledge encrypted at the application field level:** structured Firestore data such as names, email addresses, mobile numbers, room/rent/payment fields, roles, and audit metadata. These fields need to remain queryable for login, access rules, search, reports and operations. They are protected by HTTPS/TLS in transit, Google/Firebase encryption at rest, Firebase Authentication and Firestore Security Rules.

**Passwords:** Firebase passwords are not stored in Firestore by PG Ops. Temporary passwords are sent over TLS to a protected callable Cloud Function and passed to Firebase Admin Auth. Super Owner / Owner verification passwords are used only for Firebase re-authentication and are not persisted by the app.

**Aadhaar:** Firestore stores only the configured last-four digits; the proof file is stored encrypted in R2.

**Metadata caveat:** original filenames, MIME type, tenant/file path and some upload metadata are operational metadata and are not zero-knowledge encrypted. The Worker can unwrap file keys, so this is strong encrypted-at-rest envelope encryption, not an architecture where even the server can never decrypt.

### Remaining security recommendations before a large public launch

1. Configure and **enforce Firebase App Check** (reCAPTCHA Enterprise) for Firestore/Functions after validating production traffic.
2. Add **MFA for the Creator/Super Owner and preferably PG Owners**.
3. Run a formal dependency scan after install (`npm audit`) and commit package-lock files for root, Functions and Worker to make deployments reproducible.
4. Add a tested Content-Security-Policy header after confirming Firebase, FCM and App Check endpoints; Angular already avoids `innerHTML`/`eval` in this source.
5. For a higher privacy tier, design optional field-level encryption for selected PII; doing this blindly would break search/reporting/rules, so it should be an explicit architecture feature rather than a cosmetic patch.

## 2. UI-only / missing-functionality audit

No routed operational page is just a dead placeholder now. Core modules use real Firestore or calculated store data. The previously-unused generic placeholder page was removed.

**Fully connected core workflows:** Dashboard, property structure, floor/room setup, vacancy, monthly/daily residents, resident lifecycle, room transfer, rent/payments/receipts, encrypted documents, branding, profile/access, audit trail, reports, Super Owner customer control, push notifications.

**Firebase-backed real CRUD but still generic rather than domain-deep:** Food/Kitchen, Staff, Maintenance, Assets, Utilities, Expenses, Vendors, Tasks/Calendar. These screens create/edit/complete/delete/search records and optionally upload encrypted attachments, but they do not yet implement every specialist business workflow listed later in this report.

## 3. Functional consistency audit

- Core structure/resident/payment state is Firestore-backed; production does not silently fall back to demo data on a cloud error.
- Check-in, restore, checkout and room transfer use consistency/transaction safeguards where occupancy can race.
- R2 upload failures are surfaced; major resident/payment flows clean up orphan uploads when the main operation fails.
- Owner/Manager access is permission-aware both in route/UI visibility and Firestore rules.
- R2 Manager access is namespace/permission aware.
- Owner/Manager creation is server-side through Cloud Functions rather than creating a second Firebase Auth session in the browser.
- Managed-user names are tenant-specific, avoiding one PG Owner rewriting a user's global name across other PG memberships.
- Managed password-reset is limited to accounts assigned to the current PG.
- Static template handler audit found no unresolved primary click/change/submit methods.

## 4. UI / premium consistency audit

A shared premium form system is applied to inputs, selects, dates, password fields, textareas, file pickers, modal shells and focus/disabled states. Password forms expose intentional Show/Hide controls where appropriate. File inputs show professional selection/preview states for supported images/PDFs. Modals use a fixed header, scrollable content body, sticky action footer and close controls.

Navigation labels were normalized to user-facing names such as **Blocks, Floors & Rooms**, **Floor & Room Setup**, **Bed Vacancy**, **Rent & Receipts**, **Kitchen & Meals**, **Staff Management**, **Repairs & Maintenance**, **Asset Inventory**, **Utilities & Bills**, **Expense Ledger**, **Tasks & Calendar**, **Reports & Exports**, **Secure Documents**, **Alerts & Notifications**, **Audit Trail**, and **PG Settings & Access**.

Technical wording visible to ordinary users was reduced in the final pass (for example, “Cloud Connected”, “Encrypted File Vault”, “Password re-check”). Deep provider terminology remains only where it is useful in Owner/Super Owner readiness/security views.

## 5. User-friendliness / confusion audit

- **Manager:** sees only personal profile/security plus modules explicitly assigned to that Manager. Creator and Owner-management controls are hidden.
- **PG Owner:** sees their own PG, Co-owner/Manager access center, permissions, branding/settings and permitted operational data. Customer-platform sales controls are hidden.
- **Creator/Super Owner:** gets the separate locked Customer/Platform Control for sold PGs, access state, support, forced logout and platform audit.
- Top-right account card is the single account entry point; Profile is above Logout, and Logout always asks for confirmation.
- Sensitive role/permission changes require the current Owner password.
- Empty production collections show a clear empty state and, where useful, one **EXAMPLE ONLY — NOT SAVED** informational row rather than fake production records.

## 6. Features worth adding next (not defects in the current core)

### Highest priority
- Automated tests: Firestore Emulator rule tests, service/unit tests, and Playwright/Cypress end-to-end smoke tests for Owner/Manager/Super Owner flows.
- Backup **restore** + version history (download backup exists today; restore is not implemented).
- SaaS subscription layer: plan, renewal/expiry, GST invoice, grace period, automated suspend/reactivate.
- MFA / recovery-code policy for Creator and Owners.
- App Check enforcement.

### Operational expansion
- Staff: attendance clock-in/out, roster, leave approval, payroll computation, document-expiry alerts.
- Food: meal attendance/counts, stock in/out ledger, recipe consumption, low-stock rules and wastage analytics.
- Maintenance: assignee/SLA escalation, recurring preventive maintenance, before/after photo workflow.
- Assets: warranty/AMC expiry, depreciation, QR/barcode scanning.
- Utilities: meter-reading deltas, trend charts, anomaly alerts and bill reconciliation.
- Vendors: purchase orders, invoice matching and payable aging.
- Calendar: full month/week view and recurrence engine.
- Reports: deeper staff/food/expense/utility trend packs.
- Offline: durable mutation queue + conflict resolution.
- External alerts: WhatsApp/SMS/email in addition to FCM push.

## 7. Push notification audit

Implemented backend flows:
- **Rent Due Today** — scheduled daily at 08:00 Asia/Kolkata.
- **Rent Overdue** — scheduled daily while a balance remains overdue.
- **Owner/Manager audit change** — other eligible Owners/Managers receive the change; the actor is excluded.
- **Super Owner platform/customer-access change** — affected PG Owners receive the platform update.
- Notifications are also stored in the tenant notification collection and can deep-link into the app.
- Device tokens are tenant-scoped and protected by rules.

Deployment requirement: Web Push works only when the public VAPID key is present in `environment.ts`, the user grants browser notification permission, and the deployed Functions/FCM project is configured. `appCheckSiteKey` remains optional until App Check is configured.

## 8. Static/demo data requirement

Production provider is fixed to **Firebase**. Production Firestore starts from real records and does not use fake records as persisted data.

For informational/demo purposes only:
- demo mode has one sample Block, one sample Room and one sample Resident;
- each generic operations module has one sample/example row;
- empty Firebase modules may display one example row clearly labelled as not saved.

No sample row is automatically written to a customer PG's Firestore database.

## Final audit status

### Passed static checks
- TypeScript files scanned: **31**
- TypeScript parser syntax errors: **0**
- obvious Angular template tag-balance issues: **0**
- unresolved primary template handlers: **0**
- Firebase Storage SDK calls: **0**
- native `confirm()` / `alert()`: **0**
- `innerHTML`: **0**
- `eval`: **0**
- insecure non-local `http://` URLs: **0**
- TODO/FIXME/HACK markers: **0**
- Firebase Storage rules: **deny all**
- Production data provider: **Firebase**
- Binary/document provider: **encrypted Cloudflare R2**

### Release blockers / configuration checks
- **VAPID public key:** must be populated in the deployed source/build for web push.
- **App Check:** supported but not enforced until a site key and Firebase Console enforcement are configured.
- **Dependency CVE audit:** run after dependencies are installed; the distributed source currently does not include lockfiles.
- **Full runtime regression:** still recommended on desktop + mobile against the real Firebase/R2 project before selling to customers.

## Final deployment after R41 security hardening

R41 changes Firestore rules, Functions/hosting configuration and R2 Worker validation. From project root:

```powershell
npm run functions:install
npm run functions:build
firebase deploy --only firestore:rules,functions,hosting
npm run r2:deploy
npm start
```

Do **not** regenerate `FILE_KEK_B64`; keep the existing Cloudflare secret. If you already inserted the public VAPID key locally, preserve/copy it into the final `src/environments/environment.ts` before deployment.
