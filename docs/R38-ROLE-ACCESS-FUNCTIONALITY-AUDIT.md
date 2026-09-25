# R38 Role, Access, Functionality & UI Audit

## Role boundaries
- Creator / Platform control is rendered only when `platformRole == platform_owner` and `/platform` is protected by `superOwnerGuard`.
- PG Owners get full access only inside their active tenant plus Owner user-management controls.
- Managers use only the exact per-user permission list. Empty permission lists now mean no operational modules rather than falling back to a default.
- `Floor & Room Setup` and `PG Settings & Access` are Owner-only pages.
- Manager profile shows only personal account/security and assigned modules; Owner/Creator administration and tenant audit cards are hidden.

## Security fixes
- Platform-oversight memberships are filtered from tenant Owner user-management UI and protected from Owner update/delete in Firestore rules.
- Last active Owner cannot be disabled/demoted, preventing tenant lockout.
- Resident global search is unavailable without Residents permission.
- Notifications icon is hidden without Notifications permission.
- Dashboard route is permission guarded; denied routes go to Profile instead of redirect loops.

## Data-loading correctness
- Cloud bootstrap now queries only collections the signed-in Manager is allowed to read, avoiding whole-app failures from one denied Firestore collection.
- Audit logs load for Owners or Managers explicitly granted Activity access.

## UI / form system
- Added consistent premium focus, hover, disabled and placeholder states for text, email, tel, number, password, date, select and textarea controls.
- Login and user-creation password fields have professional show/hide controls.
- Manager Profile has a clear Assigned Modules section and self-service Firebase password reset.

## Static functionality audit
- Checked routed pages and primary click/ngSubmit handlers for missing local methods. No unresolved primary action handler was found; service-call handlers remain intentionally delegated to Store/Auth services.

## Additional production fixes
- R2 Worker now checks Manager permissions against file namespaces before GET/PUT; Managers can no longer open every encrypted tenant file merely because they belong to the PG.
- Generic operational modules now load/save their live rows in tenant Firestore collections instead of losing new entries on refresh.
- Creator customer-creation temporary password now has a show/hide control.
- Firestore platform-oversight membership protections use safe default-value field reads.
