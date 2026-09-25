# R42 Implementation Report — Vacancy, Sharing & Rent

## Implemented
- New Tenant check-in now starts from live vacant sharing types only.
- Sharing selection filters available Blocks, Floors, Rooms and exact vacant Beds.
- Check-in shows live vacancy counts grouped by Block and Floor.
- Vacancy page now reports exact Block → Floor → Room → Bed availability and only lists sharing types that currently have a vacancy.
- Owner Profile now contains **Sharing Starting Rates**. Rates are stored in `tenants/{tenantId}/settings/app.sharingRates` in Firestore.
- Blocks / Floors / Rooms property view displays the standard starting rate for the room's sharing type.
- New Tenant check-in shows the standard starting rate and has a separate **Actual monthly rent** input for the agreed rent.
- The actual agreed rent is stored on the Resident, separate from the PG sharing-rate guide.
- After check-in, rent/rate changes are owner-only. Managers can still perform allowed resident operations but cannot change the agreed rent, including during room transfer.
- Sharing-rate changes create an audit entry.
- Existing Firestore rules already permit `settings/app` reads for active members and writes only for tenant Owners, so no new Firestore rule deployment is required for this feature.

## Data behavior
- Sharing options are derived from real room capacity and live vacant beds; no static 1/2/3/4 list is hardcoded.
- If a 3-sharing room has no vacant bed, 3 Sharing is not shown in the check-in sharing dropdown.
- Starting rate can be zero/unset; UI clearly shows `Rate not set` until an Owner configures it.
- Actual tenant rent remains required for Monthly check-in.
