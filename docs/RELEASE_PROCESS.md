# Release process

The Aivera Field build pipeline **mirrors the Aivera Golf app**: native
projects are **generated, not committed**, builds run on **GitHub Actions**,
Android is signed with a **Gradle release keystore**, and iOS ships to
**TestFlight via Fastlane + `match`**. **EAS is not used.**

```
app.config.js / app.json   ──prebuild──▶  android/  ──gradlew──▶  AAB + APK
   (source of truth)                     ios/       ──fastlane──▶ TestFlight
```

## Local development

```powershell
cd "C:\App Builds\smartaicrm-mobile"
npm install
npm start                           # Metro
# in another terminal:
npm run android                     # builds + installs dev client on emulator/device
```

Backend URL and other build-time env come from environment variables
(`EXPO_PUBLIC_BACKEND_URL`); app.config.js reads them at prebuild time.
Default is `https://api.smartaicrm.co.za`.

## Local native builds (optional — CI is the source of truth)

### Android — signed APK for sideloading

```powershell
cd "C:\App Builds\smartaicrm-mobile"
npm run prebuild:android
cd android
.\gradlew.bat :app:assembleRelease `
  "-Pandroid.injected.signing.store.file=..\..\credentials\aivera-field-release.keystore" `
  "-Pandroid.injected.signing.store.password=$env:KEYSTORE_PASSWORD" `
  "-Pandroid.injected.signing.key.alias=$env:KEY_ALIAS" `
  "-Pandroid.injected.signing.key.password=$env:KEY_PASSWORD"
# Output: android\app\build\outputs\apk\release\app-release.apk
```

Copy the APK to your test phone (or `adb install`) — fastest FA test loop
pre-CI.

### iOS

iOS release builds require macOS + Xcode 16+. Use the CI pipeline below —
no local iOS workflow supported on Windows dev boxes.

## CI pipeline (GitHub Actions)

| Workflow | Trigger | Runner | What it does |
|---|---|---|---|
| `android-build.yml` | tag `v*`, or manual | `ubuntu-latest` | Signed **AAB** (Play) + **APK** (sideload) artifacts |
| `ios-ci.yml` | manual only | `macos-15` | Unsigned simulator build (sanity check on native diffs) |
| `ios-testflight.yml` | tag `v*`, or manual | `macos-26` | Signed archive → TestFlight via Fastlane + `match` |

**Cut a release** (both platforms):
```
git tag v0.1.0
git push origin v0.1.0
```

`versionName` / marketing version comes from `app.json` → `expo.version`
(bump before tagging). `versionCode` / iOS build number is derived
automatically from git commit count in `app.config.js`.

## Required GitHub Actions secrets

**Android (need on day one):**
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEYSTORE_BASE64` — contents of `credentials/aivera-field-release.keystore.base64.txt`
- `EXPO_PUBLIC_BACKEND_URL` — `https://api.smartaicrm.co.za`

**iOS (set when ready for TestFlight):**
- `APPLE_TEAM_ID`
- `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the `.p8` base64-encoded)
- `MATCH_GIT_URL` — private cert repo (e.g. `https://github.com/kalliedb/aivera-field-certificates.git`)
- `MATCH_PASSWORD` — encrypts the cert repo contents
- `MATCH_GIT_BASIC_AUTHORIZATION` — base64 of `<user>:<PAT>` for read/write

See `credentials/README.md` for how to generate the Android keystore + the
base64 file.

## Version numbering

`<expo.version>` (marketing) + auto `versionCode` / `buildNumber` (monotonic
git commit count). Bump `expo.version` in `app.json` for user-facing
version changes; the numeric build numbers take care of themselves.

## Channels

| Channel | Audience | How |
|---|---|---|
| **Dev** | Local dev only | `npm run android` / `npm run ios` |
| **Internal** | Team | Sideload the APK from `android-build.yml` artifact; TestFlight internal group for iOS |
| **Beta** | Closed cohort (5–10 SA FAs) | Play internal track (upload the AAB); TestFlight external testers |
| **Production** | All Aivera Field subscribers | Play production track; App Store public |

## Phased delivery roadmap (Aivera Field — FA-focused)

| Sprint | Deliverable |
|---|---|
| **M-0** | Scaffold (done) — auth store, Keychain, RootNavigator, LoginScreen |
| **FIELD-0.5** | Migrate to Golf pipeline (this sprint) — Expo prebuild, Fastlane, GH Actions |
| **FIELD-1** | Emulator smoke — `npm run android` green with dev client |
| **FIELD-2** | Cases list + detail (read-only) against live api.smartaicrm.co.za |
| **FIELD-3** | Status state machine + native GPS on `on_site` transition |
| **FIELD-4** | Photo attach (expo-image-picker) + signature capture |
| **FIELD-5** | Chat — WebSocket + polling fallback |
| **FIELD-6** | Offline queue — expo-sqlite, replay on connectivity restore |
| **FIELD-7** | Push notifications — FCM (Android) + APNs (iOS) |
| **FIELD-8** | CI green — android-build.yml + ios-testflight.yml first successful runs |
| **FIELD-9** | Play internal track + TestFlight external testers |
| **FIELD-10** | Play production + App Store submission |

## Pre-launch checklist

- [ ] All FIELD sprints (through FIELD-10) shipped + internal beta passed
- [ ] App Store screenshots (6.7" iPhone)
- [ ] Play Store feature graphic + screenshots
- [ ] Privacy policy URL live + linked in both listings
- [ ] App Store data-safety questionnaire submitted
- [ ] OAuth callback URLs include the production Universal Link domain
- [ ] Crash reporting (Sentry or similar) wired
- [ ] Push notification cert / FCM key in GH secrets (FIELD-7)
- [ ] Beta cohort feedback resolved
- [ ] Final security review (SECURITY.md checklist)

## Hotfix

1. Branch from latest production tag: `fix/hotfix-<slug>`.
2. Targeted patch + test.
3. Bump patch version in `app.json`.
4. PR → main → tag → ship.
5. iOS hotfixes still go through Apple review (typically <1 day for
   well-justified fixes).
