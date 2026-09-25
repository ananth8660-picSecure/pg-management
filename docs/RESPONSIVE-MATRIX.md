# PG Ops responsive contract (R5)

The UI uses fluid CSS and content-driven breakpoints rather than device-specific pixel layouts.

Validated layout targets:
- 320–389 px: compact phones
- 390–639 px: standard/large phones
- 640–899 px: foldables, small tablets, landscape phones
- 900–1179 px: tablets / small laptops
- 1180–1599 px: laptops / desktops
- 1600 px+: large and ultrawide monitors

Rules:
- No operational control is intentionally hidden on mobile.
- Top-bar controls wrap; search moves to its own row on narrow screens.
- Sidebar becomes a touch-friendly drawer below 900 px.
- Tables remain fully accessible through horizontal touch/mouse scrolling, while scrollbars stay visually hidden.
- Dashboard/stat grids use auto-fit/minmax so cards reflow automatically.
- Forms collapse to one column where needed.
- Dialogs use viewport-relative width/height and remain scrollable.
- Safe-area-ready viewport metadata is enabled.
