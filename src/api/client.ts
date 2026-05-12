/**
 * Axios client for the SmartAI BMS Field app.
 *
 * - Base URL from env.apiBaseUrl (https://api.smartaicrm.co.za/api/v1 by default).
 * - Request interceptor: pull the access token from the keystore and attach
 *   it as Authorization: Bearer …
 * - Response interceptor: on a 401, attempt one refresh via /auth/refresh,
 *   retry the original request once, otherwise wipe tokens and surface the
 *   error so the navigation layer can boot the user back to /login.
 *
 * The refresh path is identical to the desktop client to keep the auth
 * contract consistent across surfaces.
 */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import env from '@config/env'
import { getTokens, saveTokens, clearTokens } from '@utils/storage'

interface AuthRefreshResponse {
  success: boolean
  data?: { accessToken: string; refreshToken: string }
  error?: { code: string; message: string }
}

const client: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Authorization header on every outbound request.
client.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
  const t = await getTokens()
  if (t?.accessToken) {
    cfg.headers.set('Authorization', `Bearer ${t.accessToken}`)
  }
  return cfg
})

// Refresh-on-401. Mark retries with a custom flag so we don't loop.
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const t = await getTokens()
      if (!t?.refreshToken) return null
      const res = await axios.post<AuthRefreshResponse>(
        `${env.apiBaseUrl}/auth/refresh`,
        { refreshToken: t.refreshToken },
        { timeout: 15_000 },
      )
      if (!res.data.success || !res.data.data) return null
      await saveTokens({ ...t, accessToken: res.data.data.accessToken, refreshToken: res.data.data.refreshToken })
      return res.data.data.accessToken
    } catch { return null }
    finally { refreshing = null }
  })()
  return refreshing
}

client.interceptors.response.use(
  r => r,
  async (err: AxiosError) => {
    const original = err.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    if (err.response?.status === 401 && original && !original._retried) {
      original._retried = true
      const newToken = await refreshAccessToken()
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return client.request(original)
      }
      await clearTokens()
    }
    return Promise.reject(err)
  },
)

export default client

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}
