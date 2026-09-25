# R19 — Login / Mobile / Firebase Access Fix

- Firebase live mode no longer displays or pre-fills demo accounts.
- Login uses the real Firebase Authentication email/password.
- Authentication errors are translated to clear user-facing messages.
- After Firebase Auth succeeds, `users/{uid}` is checked immediately for `role: owner|manager`.
- Missing role documents are reported explicitly instead of silently returning to login.
- Login form is a semantic `<form>` (removes browser password-field warning).
- Mobile 360×640 login redesigned as an app-like compact screen; no clipped card or fixed oversized hero.
- Tablet/mobile use a short premium gradient header and a responsive floating login card.
