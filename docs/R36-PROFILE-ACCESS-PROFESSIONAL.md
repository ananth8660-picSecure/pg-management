# R36 Profile & Access Professional Pass

- Removed separate top-bar Profile and Logout buttons.
- Account name/avatar is the single premium account trigger.
- Account menu shows Profile & Access first and Logout at the bottom.
- Logout now always asks for a professional confirmation before Firebase sign-out.
- Super Owner customer directory card redesigned with a light premium visual treatment.
- Added distinct PG Ownership & Manager Access section.
- Adding or changing Owner/Manager access now requires the signed-in Owner current password through Firebase re-authentication.
- Existing role/permission audit logging remains active.
- Added per-user Force Logout for Owners/Managers in the same PG. The action requires the current Owner password and is audited.
- Fixed first-time tenant/user force-logout watcher handling so a newly issued logout token actually ends the active session immediately.
