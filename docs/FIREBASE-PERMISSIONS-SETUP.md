# Firebase permissions setup (R20.1)

Authentication users and Firestore role profiles are separate.

## 1. Deploy the rules from this project

From the project root after `firebase login` / `firebase use mana-pg`:

```bash
firebase deploy --only firestore:rules,storage
```

The key rule is that an authenticated user may `get` only their own `/users/{uid}` role profile before the app knows whether they are Owner or Manager. Role documents still cannot be created or edited by ordinary clients.

## 2. Create role profiles once in Firestore

Firebase Console -> Firestore Database -> Data -> collection `users`.

Create a document whose document ID is exactly the user's Firebase Authentication UID.

Owner example:

```json
{
  "name": "Ananth Kumar",
  "role": "owner"
}
```

Manager example:

```json
{
  "name": "PG Manager",
  "role": "manager"
}
```

Do not use the email address as the document ID. Use the Authentication UID.

## Why this is required

Firebase Authentication proves who signed in. The `users/{uid}` Firestore document tells PG Ops what that account is allowed to do. Keeping the two separate prevents a signed-in client from assigning itself the Owner role.
