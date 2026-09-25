# R20 — Room Transfer, Persistent Firebase Session & PIN App Lock

## Resident room transfer
- Open an active resident profile and choose **Transfer Room**.
- Target options come only from live vacant beds and show Block → Floor → Room → AC/Non-AC → Sharing → Bed.
- Confirmation re-checks vacancy before committing.
- Firebase mode uses a Firestore transaction to prevent two operators assigning the same bed at once.
- Old bed becomes vacant, target bed becomes occupied, the old room stay is closed, and a new active room stay is appended.
- Transfer history remains visible in the resident profile and an audit log is written.
- Optional checkbox can apply the target room rent; otherwise the resident's existing monthly rent is preserved.

## Persistent login
- Firebase Auth uses `browserLocalPersistence` explicitly.
- Refreshing or reopening the browser keeps the Firebase session until the user explicitly selects **Sign Out**.
- Clicking the profile no longer signs out directly. It opens an account menu with **Lock Workspace** and **Sign Out**.

## App lock
- On first successful login per user/device, PG Ops asks for a 4–6 digit device PIN.
- Default idle timeout: 10 minutes.
- Inactivity locks the UI but does not sign out from Firebase.
- Returning after inactivity requires the PIN and resumes the same authenticated session.
- Last activity is persisted locally, so reopening after a long idle period still opens to the PIN lock.
- Forgotten PIN uses **Sign out securely**, clears the local PIN verifier, and requires Firebase login again.

The PIN is an application/device lock layered on top of Firebase Authentication; it is not a replacement for Firebase credentials.
