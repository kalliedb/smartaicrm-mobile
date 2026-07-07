# credentials/

This folder holds sensitive build assets. **Nothing in here except this
README and `SECRETS.txt.example` gets committed** — see `.gitignore`.

## What lives here (locally only)

| File | Purpose | Backup? |
|---|---|---|
| `aivera-field-release.keystore` | Android release signing keystore | **YES — off-machine backup mandatory** (losing this = can never update the Play listing) |
| `aivera-field-release.keystore.base64.txt` | The keystore, base64-encoded, for GH secret `ANDROID_KEYSTORE_BASE64` | Regenerate from `.keystore` any time |
| `SECRETS.txt` | Passwords + aliases (matches the values in GH Actions secrets) | YES (secure password manager) |

## Generate the Android release keystore (one-off)

```powershell
cd "C:\App Builds\smartaicrm-mobile\credentials"
keytool -genkeypair -v `
  -keystore aivera-field-release.keystore `
  -alias aiverafield `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storetype JKS
# Enter a strong password. Store it in SECRETS.txt AND your password manager.

# Base64-encode for the GitHub secret:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("aivera-field-release.keystore")) `
  | Out-File -Encoding ascii aivera-field-release.keystore.base64.txt
```

## GitHub Actions secrets to set

Copy `SECRETS.txt.example` → `SECRETS.txt`, fill in the values you chose, then
add them to `github.com/kalliedb/smartaicrm-mobile/settings/secrets/actions`:

- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEYSTORE_BASE64` (contents of `aivera-field-release.keystore.base64.txt`)
- `EXPO_PUBLIC_BACKEND_URL` = `https://api.smartaicrm.co.za`

For iOS (set only when ready to ship TestFlight):
- `APPLE_TEAM_ID`
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (base64 of the .p8)
- `MATCH_GIT_URL` (private cert repo, e.g. `https://github.com/kalliedb/aivera-field-certificates.git`)
- `MATCH_PASSWORD`
- `MATCH_GIT_BASIC_AUTHORIZATION` (base64 of `<user>:<PAT>`)
