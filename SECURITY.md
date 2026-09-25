# Security Policy

This repository contains application source but must not contain private production credentials.

Do not commit:

- Cloudflare `FILE_KEK_B64`
- Firebase service-account JSON files
- private keys or certificates
- `.env` / `.dev.vars` files containing secrets
- exported customer / resident production data

Firebase Web config values are client configuration and are not treated as secret credentials. Access control must remain enforced through Firebase Authentication, Firestore Security Rules, Cloud Functions authorization and the R2 Worker permission layer.

For production changes, validate role boundaries for Super Owner, Owner and Manager before deployment.
