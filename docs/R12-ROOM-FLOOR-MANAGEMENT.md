# R12 — Professional Room & Floor Management

## Added
- AC / Non-AC is a first-class room property for create and edit.
- Room Type filter plus AC counts by property, block and floor.
- Full room edit: rent, room type, bathroom type, beds and inventory.
- Safe room removal: only completely vacant rooms can be removed.
- Safe floor removal: only the top-most empty floor can be removed.
- Occupied rooms/beds and active resident links are protected.
- Room IDs remain immutable after creation so payment/stay history is not broken.
- Premium confirmation surfaces and danger-zone controls.

## Data safety
Room deletion also removes the room document from Firestore when Firebase mode is enabled. Resident records are never hard-deleted. Floor removal updates the block floor count only after checking that no rooms exist on the floor.
