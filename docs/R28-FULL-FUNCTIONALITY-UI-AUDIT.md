# R28 Full Functionality + UI Audit

## Fixed
- Normal PG Owners can add another Owner/Co-owner or Manager inside the same PG from Profile & Access.
- Owner/Co-owner gets full access only to that tenant; Managers receive selected page permissions.
- Vacancy Block/Floor/Sharing filters now derive from live property data instead of hard-coded Block A/B and four floors.
- Vacancy floor summary now uses every configured block/floor.
- Vacancy `+ Assign Resident`, free-bed buttons and `Assign a vacant bed` now navigate to resident check-in and preselect the chosen bed.
- All native select controls receive consistent premium styling, focus/hover states and a stable chevron.
- Resident photo, ID proof, payment receipt and PG logo uploads show selected-file previews before encrypted R2 upload.
- PDF selections show a clear document preview card.
- Preview object URLs are revoked on close/save to avoid browser memory leaks.

## Security
- Binary files remain R2-only and encrypted. Firebase Storage is not used for media/documents.
- Tenant isolation and Super Owner controls are unchanged.

## Static audit
- Checked page buttons for missing click/router actions; the previously inert Vacancy assignment actions were wired.
- Checked all file inputs in the project; all four upload surfaces now have premium selection feedback/previews.
- Checked all select controls for consistent global interaction styling.

- Resident profile `Edit Profile` action is now functional and audit-logged.
- Resident `Record Payment` action now opens the payment modal with that resident preselected.
