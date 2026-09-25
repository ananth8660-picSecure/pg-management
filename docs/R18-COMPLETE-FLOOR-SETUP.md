# R18 — Complete Floor Setup

The Amenities & Setup area now includes a centralized Floor Command Center.

## Source-of-truth rules
- Room count, bed count, AC/Non-AC count, vacancy and room inventory totals are derived from actual Room records. They are not stored as duplicate editable totals.
- Shared floor equipment is stored separately in `floorInventories/{blockId-floor}` so common assets are not double-counted as room assets.

## Shared floor equipment
- Washing machines
- Water purifiers
- Common corridor/hall fans
- Common taps
- Common geysers
- Common lights
- CCTV cameras
- Fire extinguishers
- Common toilets
- Shoe racks
- Notes

## Complete Floor Setup modal
- Live room/bed/AC/vacancy summary
- Shared floor inventory editor
- Derived room inventory totals
- Bulk room builder (count, starting room number, beds per room, rent, AC, bathroom, default room assets)
- Existing-room breakdown with one-click Edit Room
- Sticky modal header/body/footer behavior inherited from R16+

## Persistence
- Demo mode: browser local storage
- Firebase mode: `floorInventories` Firestore collection
- Firestore: staff can read; Owner can create/update/delete floor inventory
