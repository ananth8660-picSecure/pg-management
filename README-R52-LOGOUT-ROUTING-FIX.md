# R52 Logout Routing Fix

- Normal account logout now always signs out from Firebase before navigating to `/login`.
- FCM device-token cleanup is best-effort and can no longer prevent Firebase logout.
- Authenticated user and tenant state are cleared immediately after successful Firebase sign-out.
- Logout navigation uses `replaceUrl` so browser Back does not reopen the authenticated dashboard.
- Profile menu, navigation drawer and property explorer are closed during logout.
- Forgot-PIN secure logout continues to use the same hardened AuthService logout path.
