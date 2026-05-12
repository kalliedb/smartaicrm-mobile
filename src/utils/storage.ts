/**
 * Secure token storage.
 *
 * JWTs MUST live in the OS keystore — never in AsyncStorage (which is
 * unencrypted on Android, and on iOS is plain plist). react-native-keychain
 * abstracts iOS Keychain and Android Keystore behind the same API.
 *
 * Sprint M-1 will extend this with biometric-gated reads (accessControl:
 * BIOMETRY_ANY) so the access token can only be read after Face ID /
 * fingerprint. For M-0 we keep it standard so the login flow works on the
 * simulator without enrolled biometrics.
 */
import * as Keychain from 'react-native-keychain'

const SERVICE = 'smartaicrm-mobile'
const USER_TOKENS = 'tokens'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  userId: string
  tenantId: string
}

export async function saveTokens(t: StoredTokens): Promise<void> {
  await Keychain.setGenericPassword(USER_TOKENS, JSON.stringify(t), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
  })
}

export async function getTokens(): Promise<StoredTokens | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE })
    if (!creds) return null
    return JSON.parse(creds.password) as StoredTokens
  } catch { return null }
}

export async function clearTokens(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE })
}
