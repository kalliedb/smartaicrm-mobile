# SmartAI BMS Field — Mobile App

The companion mobile app for the [SmartAI BMS](https://api.smartaicrm.co.za) platform.
Designed for South African small business owners (electricians, plumbers,
photographers, mobile service providers, consultants) to run the full
**Lead → Quote → Service → Invoice → Payment** cycle from a phone.

> **Bundled with BMS One.** No separate SKU; included in the subscription.

---

## What this repo contains

Sprint **M-0 (Foundation)** — scaffolded folder structure + login flow only.
See `docs/RELEASE_PROCESS.md` for the full phased roadmap.

```
├─ App.tsx                      # entry, wraps providers
├─ index.js                     # AppRegistry registration
├─ app.json
├─ package.json
├─ tsconfig.json                # path aliases (@/, @api/*, @screens/*, etc.)
├─ babel.config.js              # mirror tsconfig path aliases
├─ metro.config.js
├─ src/
│  ├─ api/                      # axios client + endpoint modules
│  │  ├─ client.ts              # JWT interceptor + refresh-on-401
│  │  └─ auth.ts                # /auth/login, /auth/logout
│  ├─ config/
│  │  └─ env.ts                 # react-native-config wrapper
│  ├─ navigation/
│  │  └─ RootNavigator.tsx      # Auth ↔ App stack gate
│  ├─ screens/
│  │  ├─ Auth/LoginScreen.tsx
│  │  └─ Home/HomeScreen.tsx    # M-3 will fill this in
│  ├─ store/
│  │  └─ auth.ts                # Zustand auth store
│  ├─ theme/index.ts            # colours, spacing, typography
│  └─ utils/
│     └─ storage.ts             # Keychain / Keystore token storage
├─ .env.example
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ RELEASE_PROCESS.md
│  ├─ VOICE_INTENTS.md          # (filled in sprint M-6)
│  └─ API_CONTRACT.md
└─ CONTRIBUTING.md
   SECURITY.md
```

The native `ios/` and `android/` folders are **not** committed — they're
generated locally via `react-native init` during dev setup. See below.

---

## Dev setup (first-time, ~30 min)

You need: **Node 20+**, **Watchman** (Mac), **JDK 17**, **Xcode 15+** (Mac), **Android Studio**, **CocoaPods** (Mac).

```bash
# 1. Clone
git clone git@github.com:kalliedb/smartaicrm-mobile.git
cd smartaicrm-mobile

# 2. One-time: generate native iOS + Android projects.
#    This creates the ios/ and android/ folders next to our existing src/.
#    Don't worry about overwriting — RN init only writes what's missing.
npx @react-native-community/cli@latest init SmartAICRMMobile \
  --version 0.75.4 \
  --skip-install \
  --directory _tmp
cp -R _tmp/ios ./ios
cp -R _tmp/android ./android
cp _tmp/jest.config.js ./jest.config.js
rm -rf _tmp

# 3. Install JS deps
npm install

# 4. iOS only — install CocoaPods deps
npm run pods

# 5. Copy env template
cp .env.example .env
# edit .env with your local API URL if needed (defaults to prod)

# 6. Run
npm run ios      # opens iOS Simulator
# or
npm run android  # opens Android Emulator / connected device
```

If `init` complains the directory isn't empty, pass `--skip-git-init` and copy folders manually.

---

## Daily workflow

```bash
npm start        # start Metro bundler
npm run ios      # rebuild + run iOS
npm run android  # rebuild + run Android

npm run lint
npm run typecheck
npm test
```

## Architecture in one paragraph

The mobile app is a thin React Native client over the existing SmartAI BMS
REST API at `api.smartaicrm.co.za`. JWT tokens are stored in the OS
keystore (iOS Keychain / Android Keystore via `react-native-keychain`).
A Zustand store holds session state; an axios interceptor attaches `Bearer`
headers and refreshes on 401. Offline-first SQLite (SQLCipher) +
sync engine land in sprints M-1 and M-6 — see `docs/ARCHITECTURE.md`.

## Sprint roadmap

| Sprint | Goal | Status |
|---|---|---|
| **M-0** | Foundation: navigation + login + keystore auth | ✅ this repo |
| M-1 | Local SQLite + biometric re-auth | next |
| M-2 | Quick-create Lead / Quote / Invoice (typed) | |
| M-3 | Home / Today dashboard + schedule | |
| M-4 | Send sheet (WhatsApp / SMS / email) | |
| M-5 | Yoco Tap-to-Pay + payment link | |
| M-6 | Offline read cache + voice-to-text AI | |
| M-7 | Job detail + on-site status updates | |
| M-8 | Polish + onboarding | |
| M-9 | Internal beta (TestFlight + Play Internal) | |
| M-10 | App Store + Play Store submission | |

## Related repos / services

- **Backend + web portal**: [`kalliedb/smartaicrm`](https://github.com/kalliedb/smartaicrm) (private)
- **API root**: <https://api.smartaicrm.co.za>
- **Web portal**: <https://smartaicrm.co.za>

## Security

See [SECURITY.md](./SECURITY.md). Highlights: tokens in OS keystore,
biometric re-auth (M-1), TLS 1.3 + cert pinning (production builds),
no card data on device (Yoco SDK handles tokenisation), per-device
revocation from desktop admin console.

## License

Proprietary. © 2026 SmartAI CRM (Pty) Ltd. All rights reserved.
