# Cloudflare R2 encrypted storage contract

Current binary file provider: **R2 only**.

Bucket: `mana-pg-management`

Firebase Storage is intentionally disabled for PG Ops binaries.

## Upload
Angular encrypts each file locally with AES-GCM-256 using a fresh random key and IV, then sends only ciphertext to the R2 Worker:

`PUT /v1/files/object`

Headers include Firebase ID token, object path, the one-time file key for server-side wrapping, IV, filename and MIME type. The Worker wraps the file key under `FILE_KEK_B64` and stores ciphertext + wrapped-key metadata in R2.

## Download
Angular requests:

`GET /v1/files/object?path=<objectPath>`

The Worker verifies the Firebase user and PG Ops role, unwraps the per-file key and returns ciphertext plus the authorized key/IV in HTTPS response headers. Angular decrypts in memory and creates a temporary `blob:` URL. No public R2 URL is stored.

See `r2-worker/` and `docs/R21-R2-USERS-AUDIT.md`.
