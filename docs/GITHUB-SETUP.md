# GitHub Setup

Repository:

`https://github.com/ananth8660-picSecure/pg-management.git`

## One-command Windows setup

From the project root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\git-setup.ps1
```

The script:

1. initializes Git if needed;
2. configures `origin`;
3. commits the clean project source;
4. pushes `main`;
5. creates and pushes `staging`;
6. returns the local checkout to `main`.

## Branch use

- `main` — stable production branch
- `staging` — new development, testing and integration

Promote staging changes to main only after local/CI verification.
