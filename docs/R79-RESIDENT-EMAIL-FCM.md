# R79 Resident Email + FCM

## Included
- Optional resident Email ID on New Tenant and Edit Profile.
- Payment-created Firebase trigger sends a professional HTML payment receipt email when a resident email exists.
- Monthly rent due/overdue scheduled job sends the resident an email reminder when an email exists.
- Rent payment FCM/in-app notification is visible to Owner and eligible Manager users.
- Advance/Deposit/Other payment FCM/in-app notifications remain Owner-only.
- Existing Owner/Manager notification privacy is preserved.

## One-time email setup
Email delivery uses the Resend HTTP API from Firebase Functions. FCM does not need this secret.

1. Create/verify the sender domain in your Resend account (recommended: a sender such as `noreply@picsecure.in`).
2. From the project root run:

```bat
firebase functions:secrets:set RESEND_API_KEY
```

Paste the API key when Firebase asks. Never commit the key to Git.

`MAIL_FROM` defaults to `PG Management <noreply@picsecure.in>`. If your verified sender differs, set the Firebase Functions parameter/environment value before deployment.

3. Deploy:

```bat
npm run functions:build
firebase deploy --only functions,firestore:rules,hosting
```

## Behaviour
- No resident email: payment and rent flows continue normally; email is skipped.
- Invalid resident email: UI validation blocks saving that email.
- Email provider unavailable: Firestore payment save and FCM are not rolled back; the function logs the email failure.
- Receipt proof remains encrypted in R2. The email itself is a professional transaction receipt summary; the encrypted proof is not exposed as a public attachment.
