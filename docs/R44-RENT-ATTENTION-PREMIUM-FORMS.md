# R44 — Premium forms + rent attention command center

## Sharing starting rates
- Owner Profile discovers sharing capacities from live room inventory.
- New sharing capacities appear when Profile is opened/refreshed.
- Rates are saved to `tenants/{tenantId}/settings/app.sharingRates` and remain guidance rates.
- Actual resident rent remains a separate check-in field and Owner-only editable later.
- Rate inputs now use a premium currency field without native number spinners.

## Dashboard rent attention
- Added a dashboard Outstanding Rent command card.
- Shows pending total, due-today count, overdue/partial count and affected blocks.
- Drill-down: Block -> Floor -> Room -> Resident.
- Resident rows show room, sharing, due date, status, balance, phone and direct call/WhatsApp actions.
- Resident detail shows monthly rent, paid, balance, status, due date, join date, deposit and phone.
- WhatsApp registration is not silently probed from the browser; the action opens/checks the number through WhatsApp itself.

## Forms
- Unified premium input/select/textarea sizing, focus, hover, disabled and placeholder states.
- Removed native number spinners for cleaner numeric fields.
- Mobile/tablet responsiveness added to the rent command center and rate editor.
