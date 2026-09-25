# R48 Forgot PIN logout fix

- Forgot PIN now keeps the lock overlay visible while Firebase signs out.
- The local PIN is reset only after a successful sign-out.
- Successful sign-out uses replaceUrl navigation directly to `/login`.
- Dashboard/workspace is never revealed between PIN reset and logout.
- Sign-out button shows `Signing out…` and is disabled during the operation.
- If sign-out fails, the lock remains in place and shows an error.
