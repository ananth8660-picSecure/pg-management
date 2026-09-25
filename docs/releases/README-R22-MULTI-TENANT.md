# PG Ops R22 — Multi-PG / SaaS Foundation

## What changed
- Firebase Authentication remains the identity provider.
- Firestore is now multi-tenant. Operational data lives under `tenants/{tenantId}/...`.
- R2 files are encrypted client-side and stored under `pg/{tenantId}/...`.
- Firebase Storage is not used for any binary files.
- Main platform owner can create multiple PG organizations and the first Owner for each.
- Each PG Owner can add Owner/Manager users only inside that PG.
- PG name, short name, city and encrypted logo are tenant-specific.
- Audit logs are stored inside the tenant and show actor name, role and time.

## One-time bootstrap accounts
The following existing Firebase Authentication accounts can bootstrap without manually creating Firestore documents:
- Platform owner: `ananthc8660@gmail.com`
- Default manager: `ananthcolors@gmail.com`

The platform owner must sign in once first. This creates the default `mana-pg` tenant and Owner membership. The manager can then sign in and receives recommended Manager permissions automatically.

No passwords are hard-coded. These emails must already exist in Firebase Authentication with passwords set there.

## Required deployment after extracting R22
From the Angular project root:

```bash
firebase deploy --only firestore:rules
```

Then redeploy the R2 Worker because R22 adds tenant-aware authorization and path isolation:

```bash
cd r2-worker
npm run deploy
```

The already-created R2 bucket and `FILE_KEK_B64` secret are reused. Do not create a new encryption key unless intentionally rotating keys.

## R2 Worker URL
The Angular app is already configured for:

`https://mana-pg-files.mana-pg.workers.dev`

## Firestore layout

```text
users/{uid}                         global identity/profile metadata
tenants/{tenantId}                 PG organization + branding
tenants/{tenantId}/members/{uid}   role + page permissions
tenants/{tenantId}/blocks/*
tenants/{tenantId}/rooms/*
tenants/{tenantId}/residents/*
tenants/{tenantId}/payments/*
tenants/{tenantId}/auditLogs/*
tenants/{tenantId}/settings/*
...
```

Data from one tenant is not read through another tenant path.
