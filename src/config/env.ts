/**
 * Build-time + runtime config.
 *
 * Values come from .env (loaded by react-native-config at build time).
 * Never commit real .env — see .env.example for the shape.
 */
import Config from 'react-native-config'

interface AppEnv {
  apiBaseUrl: string
  appVersion: string
  isProduction: boolean
}

const env: AppEnv = {
  apiBaseUrl: Config.API_BASE_URL || 'https://api.smartaicrm.co.za/api/v1',
  appVersion: Config.APP_VERSION || '0.1.0-dev',
  isProduction: (Config.NODE_ENV || 'development') === 'production',
}

export default env
