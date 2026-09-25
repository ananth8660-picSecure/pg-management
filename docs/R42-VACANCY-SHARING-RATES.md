# R42 Vacancy, Sharing & Rent Flow

- New Tenant check-in starts with live vacant sharing types only.
- Sharing selection filters exact Block → Floor → Room → Bed choices.
- Vacancy page shows exact availability by sharing, block, floor, room and bed.
- Owner Profile includes Firebase-backed Sharing Starting Rates.
- Property rooms display the sharing starting rate.
- Check-in stores the actual agreed rent separately from the standard sharing rate.
- After check-in, rent/rate changes are owner-only at service level and reflected in UI.
- Existing Firestore `tenants/{tenantId}/settings/app` document stores `sharingRates`; existing rules already restrict writes to tenant owners.
