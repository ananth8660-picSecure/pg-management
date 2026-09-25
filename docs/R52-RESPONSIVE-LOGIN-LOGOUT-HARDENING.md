# R52 Responsive Login + Logout Hardening

- Rebuilt phone/tablet login layout to avoid clipped cards and blank lower panels.
- Mobile login remains a single viewport composition without page scrolling.
- Added tablet landscape composition and compact short-height fallbacks.
- Added 901–1100px tablet workspace drawer layout so desktop sidebar no longer squeezes content.
- Added cross-device overflow guards for panels, forms, tables and property explorer.
- Logout no longer depends on FCM token cleanup succeeding; Firebase sign-out always runs.
- AuthService clears local session state in `finally`, and Shell redirects to `/login` with `replaceUrl`.
