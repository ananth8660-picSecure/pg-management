# R23 Super Owner Control

- The first configured creator account is bootstrapped from `APP_CONFIG.platform.platformOwnerEmail` and `platformOwnerName` after successful Firebase Authentication.
- No password is stored in Angular source code. The Super Owner vault uses Firebase password re-authentication every time the private platform screen is opened/re-opened.
- The platform route is guarded and the navigation item is rendered only for `platformRole = platform_owner`.
- While locked, platform-wide content is blurred and non-interactive. The vault auto-locks when the browser tab becomes hidden.
- Normal tenant Owners cannot see or route to Super Owner Control.
- Super Owner can see total/active PG counts, list all PG tenants, create a new PG + first Owner, and open any PG workspace for oversight.
- Each tenant remains isolated under `tenants/{tenantId}/...`; encrypted R2 files remain under tenant-scoped paths.
- Initial default PG accounts are bootstrapped only for the configured known emails. Future tenant users are created by their PG Owner from Profile & Access.
