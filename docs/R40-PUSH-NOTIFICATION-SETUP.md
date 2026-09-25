# R40 Push Notification Setup

## One-time Firebase Web Push setup

Firebase Console → Project settings → Cloud Messaging → Web configuration / Web Push certificates.
Create or copy the public VAPID key and set:

```ts
firebase: {
  // existing config...
  vapidKey: 'YOUR_PUBLIC_WEB_PUSH_KEY'
}
```

Do not put Firebase service-account private keys in Angular.

## Deploy backend

```powershell
npm run functions:install
npm run deploy:backend
```

This deploys Firestore rules and Functions.

## Push functions included

- `createTenantUser` — secure server-side Owner/Manager account creation.
- `createCustomerTenant` — secure server-side customer PG + first Owner creation.
- `notifyTenantAudit` — pushes another Owner/Manager's tenant change to authorized users.
- `notifyPlatformAudit` — Super Owner platform changes to PG Owners.
- `dailyRentNotifications` — 08:00 IST rent due/overdue notifications.

## Device setup

Sign in → Profile & User Access → Push Notifications → **Enable Push on This Device**.
Each browser/device must grant notification permission once.
