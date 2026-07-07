// Dynamic Expo config — single source of truth `expo prebuild` reads to
// generate the native android/ and ios/ projects in CI. Mirrors the
// Aivera Golf app's pattern.
//
// Build identity:
//   android.versionCode = git commit count (monotonic)
//   ios.buildNumber     = git commit count by default; Fastlane overrides
//                         it with the CI run number at archive time.
//
// Build-time env (shell locally, GitHub Actions secret in CI):
//   EXPO_PUBLIC_BACKEND_URL  https://api.smartaicrm.co.za
const { execSync } = require('child_process')

function gitCommitCount() {
  try {
    const out = execSync('git rev-list --count HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return parseInt(out, 10) || 1
  } catch {
    return 1
  }
}

module.exports = ({ config }) => {
  const backendUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.smartaicrm.co.za'
  const buildNumber = gitCommitCount()

  return {
    ...config,
    ios: {
      ...config.ios,
      buildNumber: String(buildNumber),
    },
    android: {
      ...config.android,
      versionCode: buildNumber,
    },
    extra: {
      ...config.extra,
      // Read at runtime via Constants.expoConfig.extra.EXPO_PUBLIC_BACKEND_URL
      // so the app has one deterministic value baked in at build time.
      EXPO_PUBLIC_BACKEND_URL: backendUrl,
    },
  }
}
