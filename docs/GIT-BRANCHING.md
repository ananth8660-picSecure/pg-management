# Git Branching Workflow

## Branches

### `main`
Production branch. Firebase Hosting production deployments should come from a verified `main` commit.

### `staging`
Integration branch for new changes, UI revisions and backend updates. Test here before merging into `main`.

## Recommended flow

1. Start new work from `staging`.
2. Build and test locally.
3. Push changes to `staging`.
4. Run CI and smoke tests.
5. Merge `staging` into `main` only after validation.
6. Deploy the validated `main` commit to Firebase Hosting / backend.

Do not commit production secrets. R2 encryption secrets remain in Cloudflare Worker Secrets.
