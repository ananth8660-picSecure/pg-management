# R43 Implementation Report

## Requested fixes completed

1. New-room duplicate guard now checks live room inventory while typing and blocks Create with an immediate “Already added” message.
2. Room cards now show each bed separately. Occupied beds show resident name + that resident’s actual agreed rent; vacant beds show the configured sharing/default guidance rate.
3. Generic module empty state/sample preview was repaired so example text no longer collapses into a narrow vertical strip.
4. Primary form errors in room, resident, transfer, payment and generic-operation modals are surfaced at the top of the modal.
5. Primary save actions expose saving/busy state and spinner-ready aria-busy styling; duplicate submissions are blocked for room save.
6. Filter areas now carry a clear FILTERS chip and active filter surfaces have a highlighted premium treatment.
7. Global form/select/input styling was hardened with consistent height, focus ring, select chevron, disabled state and responsive layout.
8. Header search now includes an expandable Property Explorer with Block → Floor → Room filters.
9. Property Explorer room cards show sharing, vacancies, AC/bath, rent-attention count, repair count and every bed.
10. Unpaid residents inside a room are listed by name and can open an immediate resident detail card.
11. Search accepts resident data, room number/room ID and floor text/number, returning room/floor cards.
12. Maintenance data is live-watched (for users with maintenance permission) so room/floor explorer repair indicators are Firebase-backed.
13. Layout includes mobile/tablet responsive fallbacks for the explorer, room cards, filters and resident detail card.

## Data behavior

- Existing Firebase room/resident/payment records remain the source of truth.
- No new fake production records are inserted.
- Per-bed displayed rent is derived from the occupied resident’s actual agreed rent; vacant beds use the sharing starting rate, falling back to the room default rent.
- Repair counts come from the tenant `maintenance` Firestore collection when the signed-in role is allowed to read that module.

## Deployment

Frontend/store UI changes only. Existing Firestore schema/rules and R2 worker remain compatible. Start with `npm start` after replacing the source.
