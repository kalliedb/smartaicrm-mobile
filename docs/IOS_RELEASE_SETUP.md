# iOS release setup — first-time Apple Developer + GitHub secrets

This runbook takes you from **no Apple account** to a **first TestFlight
build** cut by CI. Follow it once; every future release is just a
`git tag v0.2.0 && git push origin v0.2.0`.

Total time: ~1 hour of clicking + up to 48h for Apple to finish
enrolment (they verify identity). You can complete everything **except
step 1** the same day.

---

## 0. Prereqs

- Apple ID (a personal one is fine — you'll upgrade it to a Dev account)
- ID document (SA passport / driver's licence) — Apple's identity check
- Bank card that supports **USD $99/year** (about R1,800/year at 2026 rates)
- Access to `github.com/kalliedb/smartaicrm-mobile` **Settings**

---

## 1. Enrol in the Apple Developer Program

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs/) → **Enroll**.
2. Sign in with your Apple ID → agree to the Developer Agreement.
3. Choose **Individual** (fastest — ID check only, ~1–2 days). Choose
   **Organization** only if you want the app listed under the company
   name and are prepared for a **D-U-N-S number** lookup (adds ~5 days).
4. Enter tax details (Apple defaults to your Apple ID's country — set
   to South Africa if not already). Pay USD $99.
5. Wait for the `Welcome to the Apple Developer Program` email.

**Deliverable:** you can now sign into
[developer.apple.com/account](https://developer.apple.com/account) and
see the *Certificates, Identifiers & Profiles* section.

---

## 2. Grab your Team ID

1. [developer.apple.com/account](https://developer.apple.com/account) → **Membership**.
2. Copy the **Team ID** — a 10-character alphanumeric like `A1B2C3D4E5`.

**Save as:** `APPLE_TEAM_ID` (GitHub secret).

---

## 3. Register the App ID

The Bundle ID must be **`solutions.aivera.field`** — matches
`app.json → expo.ios.bundleIdentifier`. Don't change it later; Apple
treats bundle changes as new apps.

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers** → **+**.
2. Choose **App IDs** → **Continue**.
3. Choose **App** → **Continue**.
4. **Description:** `Aivera Field`
5. **Bundle ID:** *Explicit* → paste `solutions.aivera.field`
6. **Capabilities to enable now:**
   - `Push Notifications` (required — FIELD-6 push works via APNs behind Expo)
   - `Sign In with Apple` — leave off for now
   - `Associated Domains` — leave off
7. **Continue** → **Register**.

No cert or provisioning profile yet — `fastlane match` creates those for
you on the first CI run.

---

## 4. Create the app in App Store Connect

App Store Connect is separate from the Developer portal — same login,
different site. This is where TestFlight lives.

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
2. Fill in:
   - **Platform:** iOS
   - **Name:** `Aivera Field` (this is what shows in TestFlight + App Store)
   - **Primary Language:** English (South Africa)
   - **Bundle ID:** select `solutions.aivera.field` (dropdown — appears
     because you registered it in step 3)
   - **SKU:** `aivera-field` (internal only, any unique string)
   - **User Access:** Full Access
3. **Create**.

You now have an app shell with no builds yet — that's normal; CI uploads
builds via Fastlane in step 9.

---

## 5. Create the App Store Connect API key

This key lets CI upload builds without your Apple ID password. It's
the modern replacement for `FASTLANE_USER` / `FASTLANE_PASSWORD` +
two-factor-auth pain.

1. App Store Connect → **Users and Access** → **Integrations** (top nav) → **Team Keys**.
2. **Generate API Key** (or **+** button).
3. Fill in:
   - **Name:** `Aivera Field CI`
   - **Access:** *Admin* (needed to upload + manage TestFlight)
4. **Generate**.
5. Note the **Key ID** (10-char) and **Issuer ID** (UUID at the top of the page).
6. **Download API Key** — Apple gives you a `.p8` file **once**. Save
   it. If you lose it, revoke and regenerate.

**Save as GitHub secrets:**

| Secret name       | Value |
|-------------------|-------|
| `ASC_KEY_ID`      | The 10-char Key ID |
| `ASC_ISSUER_ID`   | The Issuer ID UUID |
| `ASC_KEY_P8`      | **Base64-encoded** contents of the `.p8` file (see below) |

To base64 the `.p8` file (PowerShell, in the folder where you saved it):

```powershell
$p8 = Resolve-Path "AuthKey_XXXXXXXXXX.p8"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($p8)) `
  | Set-Clipboard
# Value is now in your clipboard — paste as the ASC_KEY_P8 secret value.
```

---

## 6. Create the `match` certificates repo

`fastlane match` stores the distribution certificate + provisioning
profile encrypted in a **private git repo**. This is the "no signing
files on my laptop" pattern — CI decrypts on the runner, the runner
gets deleted after the build.

1. On GitHub → **New repository** → **Private**.
   - **Name:** `aivera-field-certificates` (empty repo, no README needed)
   - **Owner:** same account (`kalliedb`)
2. Create a **Personal Access Token (PAT)** with `repo` scope only:
   - github.com → your profile → **Settings** → **Developer settings** →
     **Personal access tokens** → **Fine-grained tokens** → **Generate new**
   - **Name:** `aivera-field-match-cert-access`
   - **Expiration:** 1 year
   - **Repository access:** Only select repositories → pick
     `aivera-field-certificates`
   - **Permissions → Repository:** `Contents: Read and write`,
     `Metadata: Read-only`
   - **Generate token** → copy the `ghp_…` string
3. Build the git URL with embedded credentials for the `match` clone:
   - Format: `https://<your-github-user>:<PAT>@github.com/kalliedb/aivera-field-certificates.git`
   - Or use the basic-auth secret separately (below)

**Save as GitHub secrets:**

| Secret name                       | Value |
|-----------------------------------|-------|
| `MATCH_GIT_URL`                   | `https://github.com/kalliedb/aivera-field-certificates.git` |
| `MATCH_PASSWORD`                  | A strong random string (**save this in your password manager** — you'll need it if you set up another machine) |
| `MATCH_GIT_BASIC_AUTHORIZATION`   | Base64 of `<github-username>:<PAT>` (see below) |

Build the basic-auth string (PowerShell):

```powershell
$user = "kalliedb"
$pat  = "ghp_YOUR_TOKEN_HERE"
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$user`:$pat")) `
  | Set-Clipboard
# Value is now in your clipboard — paste as MATCH_GIT_BASIC_AUTHORIZATION.
```

---

## 7. Add the last non-Apple secret

If you didn't set this during Android setup, do it now:

| Secret name                | Value |
|----------------------------|-------|
| `EXPO_PUBLIC_BACKEND_URL`  | `https://api.smartaicrm.co.za` |

---

## 8. Confirm the GitHub secrets are complete

`github.com/kalliedb/smartaicrm-mobile/settings/secrets/actions` should list
all of:

- **Android** — `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`
- **Shared** — `EXPO_PUBLIC_BACKEND_URL`
- **iOS**   — `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `MATCH_GIT_URL`, `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`

Total: **12 secrets**.

---

## 9. Cut the first cross-platform release

```powershell
cd "C:\App Builds\smartaicrm-mobile"
git pull

# Bump expo.version in app.json for a user-facing version change
# (skip if you're happy with the current 0.1.0):
# ...edit app.json...
# git add app.json && git commit -m "chore: bump version to 0.2.0"
# git push

# Tag + push — fires both Android + iOS workflows
git tag v0.1.0
git push origin v0.1.0
```

Watch `github.com/kalliedb/smartaicrm-mobile/actions`:

1. **Android Build** — 12–20 min on a warm cache, artifacts drop
2. **iOS TestFlight** — 25–40 min on a cold `macos-26` runner
   - Step *Build + upload to TestFlight* is where the interesting logs
     live. The **first ever run** creates the distribution cert + profile
     in your `aivera-field-certificates` repo. Every subsequent run
     just decrypts and reuses.

If iOS fails with:

- **`Could not find any provisioning profile matching`** — you almost
  certainly missed enabling Push Notifications in step 3.6. Fix on
  Apple's portal, delete the `certs/distribution/*` and `profiles/*`
  files in the `aivera-field-certificates` repo, rerun.
- **`invalid curve name`** — happens once every few years when Ruby's
  crypto library on the runner image drifts. Retry the workflow; if it
  repeats, add `gem "openssl"` to `Gemfile` and rerun bundler.
- **`No Xcode 26 found`** — GitHub swapped runner images; edit
  `.github/workflows/ios-testflight.yml` to select the newest available
  Xcode.

Any other failure → paste the failing step's log and we'll diagnose.

---

## 10. First TestFlight tester install

1. App Store Connect → **My Apps** → *Aivera Field* → **TestFlight** tab.
2. When the build finishes processing on Apple's side (2–5 min after
   the CI upload finishes), it appears in **iOS Builds**.
3. **Test Information** — fill in *Feedback email* and *Beta App Description*.
4. **Internal Testing** → **+** → add your email → save. You get a
   TestFlight invite in your Apple ID inbox.
5. On the iPhone: install the **TestFlight** app from the App Store,
   accept the invite → tap **Install**.

Every future `git tag v0.x.y` cuts a new TestFlight build automatically.

---

## Known follow-ups (not blocking)

- **App Store Connect content submission** — screenshots, description,
  privacy nutrition labels. Needed only when you promote from
  TestFlight → App Store review. Prepare while beta testers are using
  the app.
- **Tap-to-Pay entitlement** — apply early (weeks of lead time) if you
  ever want in-app card acceptance. Not on the FA roadmap today.
- **Push notification payload testing** — Apple accepts pushes from
  Expo's proxy out of the box because you enabled *Push Notifications*
  in step 3.6. Test tomorrow after your first TestFlight install.
