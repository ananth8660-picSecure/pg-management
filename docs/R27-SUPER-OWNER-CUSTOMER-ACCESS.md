# R27 — Super Owner Customer Access Control

## Owner / Manager login creation
- PG Owner: top-right Profile -> Profile & User Access -> + Add User.
- Enter full name, email, temporary password and role.
- Manager role exposes page-by-page permissions.
- Existing users have Manage Access and Reset Password controls.

## Super Owner Vault
- Visible only to the configured platform creator.
- Opening the page keeps all platform data blurred until Firebase password re-authentication succeeds.
- Lists every PG customer with Owner, city, status, created date and tenant ID.
- Create PG + first Owner login.
- Activate / Suspend customer workspace.
- Force Sign-out for all current customer sessions while leaving the workspace active.
- Send Owner password reset email.
- Open a PG for support.
- Platform-wide access actions are recorded in platformAuditLogs.

## Access enforcement
- Suspended tenants are denied by Firestore tenant rules, not only hidden in the UI.
- Force Sign-out stores forceLogoutEpoch; old Firebase sessions fail tenant Firestore rules until the user signs in again.
- The R2 Worker also verifies tenant active state and forceLogoutEpoch before encrypted file reads/writes.

## Deploy after upgrading
1. firebase deploy --only firestore:rules
2. npm run r2:deploy
3. npm start

Do not recreate FILE_KEK_B64. The existing Cloudflare Worker secret remains in Cloudflare.
