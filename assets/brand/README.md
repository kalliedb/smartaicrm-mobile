# Aivera Field — brand source

Drop the master logo here:

- **Preferred:** `aivera-field.svg` — vector, transparent background, icon only (no
  "AIVERA FIELD" wordmark; wordmark version can go alongside as
  `aivera-field-wordmark.svg` if we want it for /mobile marketing later).
- **Fallback:** `aivera-field.png` — ≥ 1024×1024, transparent background.

## What gets generated from it

Ran via `node scripts/generate-brand-assets.mjs` from the repo root (added
alongside the drop). Emits every raster size into:

- iOS `AppIcon.appiconset/*.png` (13 sizes)
- Android `res/mipmap-*` (5 densities + adaptive foreground)
- Expo `assets/icon.png` + `assets/adaptive-icon.png` + `assets/splash.png`
- Portal (`smartaicrm/build/public`) — favicon.svg, apple-touch-icon.png,
  icon.png, icon.svg
- Play Store 512 + App Store 1024 marketing icons

## Background + brand constants (already wired)

- Purple: `#3E1F6E` (adaptive Android bg + splash bg — do NOT change)
- Accent purple: `#5B3FBF`
- Accent blue: `#36A4FC`
