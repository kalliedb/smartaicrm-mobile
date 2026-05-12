# Release process

## Build pipeline (target — set up in sprint M-9)

```
git tag v0.1.0
  │
  ▼  GH Actions
EAS Build (iOS)     ──▶  TestFlight  ──▶  App Store Connect  ──▶  Apple review (1–3 days)
EAS Build (Android) ──▶  Play Internal ──▶  Play Console     ──▶  Play review (a few hours)
```

## Version numbering

`<major>.<minor>.<patch>-<build>` — e.g. `0.1.0-12`.

- Bump `package.json` version on every release.
- iOS `CFBundleShortVersionString` + `CFBundleVersion` synced from package.json
  via Fastlane (M-9).
- Android `versionName` + `versionCode` synced same way.

## Phased delivery roadmap

| Phase | Spec scope | Sprint(s) | Target |
|---|---|---|---|
| **MVP** | Quick-create Lead/Quote/Invoice; WhatsApp/email send; Yoco Tap-to-Pay + payment link; basic schedule; biometric login; offline read | M-0 → M-10 | Q1 |
| **Phase 2** | Voice-to-text AI; photo capture; offline write + sync; QR/EFT/cash; WhatsApp Business API | M-11 → M-16 | Q2 |
| **Phase 3** | Conversational AI assistant; route planning; expanded SA languages; customer self-service portal links | M-17 → M-22 | Q3 |
| **Phase 4** | Multi-user team mode; advanced reporting; IoT / asset integration; field-service scheduling | M-23 → M-28 | Q4 |

## Channels

| Channel | Audience | How |
|---|---|---|
| **Dev** | Local dev only | `npm run ios` / `npm run android` |
| **Internal** | Team — every commit on `main` | EAS Build internal channel; TestFlight internal testers / Play internal track |
| **Beta** | Closed cohort (5–10 SA owners) | EAS Build preview channel; TestFlight external + Play closed |
| **Production** | All BMS One subscribers | EAS Build production; App Store + Play Store public |

## Pre-launch checklist (M-10)

- [ ] All MVP sprints (M-0 → M-9) shipped + internal beta passed
- [ ] App Store screenshots (6.7" iPhone, iPad if shipping)
- [ ] Play Store feature graphic + screenshots
- [ ] Privacy policy URL live + linked in store listings
- [ ] App Store data-safety questionnaire submitted
- [ ] iOS Tap-to-Pay entitlement granted (apply early — weeks of lead time)
- [ ] Yoco production keys in EAS secrets
- [ ] OAuth callback URLs include the production Universal Link domain
- [ ] Crash reporting (Sentry) wired
- [ ] Push notification cert / FCM key in EAS secrets
- [ ] Beta cohort feedback resolved
- [ ] Final security review (SECURITY.md checklist)

## Hotfix

If a critical bug needs to go out quickly:

1. Branch from latest production tag: `fix/hotfix-<slug>`.
2. Targeted patch + test.
3. Bump patch version.
4. PR → main → tag → ship.
5. iOS hotfixes still go through Apple review (typically <1 day for
   well-justified fixes).
