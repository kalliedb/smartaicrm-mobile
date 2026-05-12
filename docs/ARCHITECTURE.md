# Architecture

## One-line summary

A React Native client over the existing **api.smartaicrm.co.za** backend.
Identical auth + entity model as the web portal; mobile is a new
consumer, not a new backend.

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  Screens  ── React Navigation native-stack                │
├──────────────────────────────────────────────────────────┤
│  Stores   ── Zustand (auth + later: jobs, schedule, etc.) │
├──────────────────────────────────────────────────────────┤
│  Domain modules:                                          │
│  api/        sync/         voice/      payments/   comms/ │
├──────────────────────────────────────────────────────────┤
│  Local DB ── SQLite + SQLCipher (M-1 onwards)             │
│  Keystore ── react-native-keychain                        │
├──────────────────────────────────────────────────────────┤
│  Network  ── axios → https://api.smartaicrm.co.za/api/v1  │
└──────────────────────────────────────────────────────────┘
```

## Sync model (M-6+)

Every write the user makes is committed to the local SQLite DB **first**
and queued in an outbox. The sync engine drains the outbox to the server
when network is available. Conflicts use last-write-wins by timestamp;
flagged in the sync log for review.

Critical reference data (customer list, catalogue) is pre-cached on
login so reads work offline. The sync indicator in the status bar
shows current state: green / amber / red.

## Voice pipeline (M-6+)

```
mic long-press ─▶ Capture (native audio API)
                    │
                    ▼
                  Transcribe
                    │      on-device first (Apple Speech / Android STT)
                    │      cloud fallback (Whisper via backend AI gateway)
                    ▼
                  Extract intent + fields (Claude function-calling via backend)
                    │
                    ▼
                  Preview screen (confidence indicators per field)
                    │
                    ▼  user reviews → Save / Cancel
                  Commit (same path as typed entity creation)
```

The backend AI gateway tracks token usage against the tenant's monthly
AI Credit pool (see the AI Token Model spec).

## Payment pipeline (M-5)

```
Owner taps "Collect payment"
   │
   ▼
Method picker (Tap-to-Pay default, Payment link, QR, EFT, Cash)
   │
   ▼
Yoco Mobile SDK ── NFC, card reader, payment link, EFT
   │
   ▼  3 sec
Yoco confirms ── webhook hits backend → invoice marked paid
   │
   ▼
Owner sees success, receipt auto-sent (WhatsApp / SMS / email)
```

PCI scope is SAQ-A because card data never reaches our code — Yoco's
SDK tokenises before handing back to the app.

## Why React Native (vs Flutter)

- TypeScript across stack (web, server, mobile)
- Shared types with the web's `src/services/*` (copy first, npm
  package later)
- Mature ecosystem for the libs we need (Yoco, NFC, biometric, SQLCipher)
- Team can review across surfaces without context-switching languages

## What's hosted where

| Concern | Where |
|---|---|
| API + DB | Render (existing `smartaicrm-backend` web service) |
| Web portal | Render (existing `smartaicrm-web` static site) |
| Mobile builds | EAS Build (preferred) or Fastlane on GitHub Actions |
| App distribution | Apple App Store + Google Play Store |
| Crash / analytics | Mixpanel or Amplitude (M-9) |
