/**
 * Auth state — Zustand store keeping the logged-in user in memory for the
 * UI. Tokens themselves live in the OS keystore (see utils/storage.ts);
 * this store only holds the non-sensitive identity bits so screens can
 * render headers, route-guard, etc. without an async read.
 */
import { create } from 'zustand'
import { authApi } from '@api/auth'
import { saveTokens, getTokens, clearTokens, type StoredTokens } from '@utils/storage'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: SessionUser | null
  bootLoading: boolean       // true on app launch while we hydrate from the keystore
  busy: boolean              // true during login / logout
  error: string | null

  boot: () => Promise<void>
  login: (identifier: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  bootLoading: true,
  busy: false,
  error: null,

  /**
   * Called once on app launch. If we have stored tokens we trust the user
   * is still logged in (a stale token will surface as a 401 on the first
   * API call and the interceptor will refresh / clear as appropriate).
   */
  boot: async () => {
    try {
      const tokens = await getTokens()
      if (tokens) {
        // We don't have the full user object on the keystore — just the
        // ids. M-1 will add a /me hydrate call here. For M-0 we hold a
        // minimal shape that lets the navigation gate decide which stack
        // to render.
        set({
          user: { id: tokens.userId, tenantId: tokens.tenantId, email: '', name: '', role: '' },
        })
      }
    } finally {
      set({ bootLoading: false })
    }
  },

  login: async (identifier, password) => {
    set({ busy: true, error: null })
    try {
      const res = await authApi.login(identifier, password)
      if (!res.success || !res.data) {
        set({ error: res.error?.message ?? 'Login failed', busy: false })
        return false
      }
      const stored: StoredTokens = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        userId: res.data.user.id,
        tenantId: res.data.user.tenantId,
      }
      await saveTokens(stored)
      set({ user: res.data.user, busy: false })
      return true
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } }; message?: string })
        .response?.data?.error?.message ?? (err as Error).message ?? 'Network error'
      set({ error: msg, busy: false })
      return false
    }
  },

  logout: async () => {
    set({ busy: true })
    try { await authApi.logout() } catch { /* server-side optional */ }
    await clearTokens()
    set({ user: null, busy: false, error: null })
  },
}))
