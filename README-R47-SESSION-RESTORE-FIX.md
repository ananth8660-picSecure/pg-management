# R47 Session Restore / Login Flash Fix

- Router guards now wait for Firebase Auth initial persistence restoration.
- Existing authenticated sessions no longer route through `/login` on refresh/open.
- App Lock remains separate from Firebase sign-in and can still appear after the configured idle timeout.
- The previous 4.5s watchdog no longer forces `ready=true` and creates a false guest state.
- Login remains reachable only when Firebase has definitively resolved no authenticated user.
