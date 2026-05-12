/**
 * Auth endpoints — mirrors the desktop /api/v1/auth/* surface.
 */
import client, { type ApiEnvelope } from './client'

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    tenantId: string
    email: string
    name: string
    role: string
  }
}

export const authApi = {
  login: (identifier: string, password: string) =>
    client.post<ApiEnvelope<LoginResponse>>('/auth/login', { identifier, password }).then(r => r.data),

  logout: () =>
    client.post<ApiEnvelope<unknown>>('/auth/logout').then(r => r.data),
}
