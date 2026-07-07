/**
 * Build-time + runtime config.
 *
 * FIELD-0.5 switched from react-native-config → expo-constants so a single
 * source of truth (app.config.js) drives the value baked into every build.
 * Set EXPO_PUBLIC_BACKEND_URL in your shell (dev) or as a GH Actions secret
 * (CI); app.config.js reads it and Constants.expoConfig.extra exposes it.
 */
import Constants from 'expo-constants'

interface AppEnv {
  apiBaseUrl: string
  appVersion: string
  isProduction: boolean
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>
const backendRoot = (extra.EXPO_PUBLIC_BACKEND_URL as string | undefined)
  || 'https://api.smartaicrm.co.za'
// The desktop API is mounted at /api/v1; append here so callers pass paths
// like '/auth/login' unchanged.
const apiBaseUrl = backendRoot.replace(/\/$/, '') + '/api/v1'

const env: AppEnv = {
  apiBaseUrl,
  appVersion: (Constants.expoConfig?.version as string | undefined) ?? '0.0.0',
  isProduction: !__DEV__,
}

export default env
