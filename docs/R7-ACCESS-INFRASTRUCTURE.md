# R7 — Infrastructure, Roles & Access

## Owner / Manager login
Demo mode now uses two separate accounts:
- Owner: `owner@demo.local` / `Owner@123`
- Manager: `manager@demo.local` / `Manager@123`

When Firebase is enabled, Firebase Authentication and the `users/{uid}.role` field provide the real role.

## Route protection
The sidebar and Angular route guard use the same permission source. A Manager cannot open a hidden page by typing the URL directly.

Default Manager pages: Dashboard, Property Map, Residents, Vacancy, Rent & Payments, Food, Staff, Maintenance, Assets, Utilities, Vendors, Calendar, Documents, Notifications.

Default Owner-only pages: Amenities & Setup, Expenses, Reports, Activity Log, Settings & Access.

Owner can change Manager page access under **Settings & Access → Manager Access**. Settings itself always remains Owner-only.

## Amenities & Infrastructure
The Owner setup screen manages:
- Blocks and floor counts
- Rooms
- 1 / 2 / 3 / 4 sharing
- Auto-created beds
- Monthly rent
- Attached/common bathroom
- AC / non-AC
- Fans
- Geysers
- Taps
- Lights
- Cupboards
- Tables
- Chairs

The screen shows totals at property, block, floor and room level.

## Smooth scrolling
R7 uses a single natural page scroll, hidden visual scrollbars, touch momentum scrolling, contained nested scrolling only where necessary, and smooth programmatic scrolling.
