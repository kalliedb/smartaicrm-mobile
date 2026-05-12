# Security

## At-rest

- **JWTs** in iOS Keychain / Android Keystore (`react-native-keychain`)
  with `WHEN_UNLOCKED` accessibility. Never in `AsyncStorage`.
- **Local DB** (M-1 onwards): SQLite encrypted with SQLCipher; key in
  the keystore.
- **Cached voice audio** retained 24 hours then auto-purged.
- **Card data**: never on device. Yoco SDK tokenises before our app
  sees it — we stay in PCI SAQ-A scope.

## In-transit

- TLS 1.3 required. HTTP rejected.
- **Certificate pinning** on production builds (M-8). Disabled in dev so
  local proxies still work.

## Auth

- Session JWT + refresh token. Refresh-on-401 in `src/api/client.ts`.
- **Biometric re-auth** (M-1) gates app entry after first login. Bypass
  via device PIN.
- Per-device registration sent with login (M-1). Admin can revoke any
  device from the desktop console — token refresh fails after revocation.

## OAuth

- Mobile uses its **own** Google + Microsoft OAuth client IDs (separate
  from the web app's). Stored on the backend env, never in the mobile
  binary.

## Build secrets

- iOS provisioning profiles + App Store Connect API key: EAS secrets /
  GitHub Actions encrypted secrets. Never in repo.
- Android upload keystore: 1Password vault. Fingerprint pinned in GH
  Actions vault. Never in repo.
- Yoco public key: in `.env`; private key never leaves backend.

## What goes in the repo, ever

- ❌ `.env` files with real values
- ❌ keystores, mobileprovisions, `.p8` keys
- ❌ hardcoded API tokens of any kind
- ✅ `.env.example` with placeholders
- ✅ `app.json` with display name

## Reporting

Found a vulnerability? Email **security@smartaicrm.co.za** — do not open
a public issue. PGP key on request.

## POPIA + audit

The mobile app inherits the platform's POPIA stance. All API calls run
through the same authenticated `api.smartaicrm.co.za` surface; audit
logs on the server capture every mutation. The mobile app itself stores
only what the owner needs for offline operation, encrypted, on their
own device.
