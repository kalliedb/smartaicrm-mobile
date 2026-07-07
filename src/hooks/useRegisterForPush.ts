/**
 * useRegisterForPush — request notification permission on first launch,
 * fetch the Expo push token, hand it to the server so future dispatch
 * events can wake the FA's phone.
 *
 * We use the Expo Push Notifications service (not raw FCM/APNs) because
 * it needs zero Firebase / Apple push key setup on our side — Expo's
 * infra proxies to both stores. Switching to raw FCM/APNs is a follow-up
 * when we outgrow the free tier or need custom payload shapes Expo
 * doesn't expose.
 *
 * The server endpoint /me/push-tokens is expected to accept
 *   { token: string, platform: 'ios' | 'android' | 'web' }
 * and upsert on (userId, token). If it 404s we swallow — this hook is
 * best-effort and never blocks the app.
 */
import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import client from '@api/client'

// Show notifications while the app is foregrounded — otherwise they go
// straight to the system tray only when we're backgrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

async function fetchExpoToken(): Promise<string | null> {
  if (!Device.isDevice) return null   // simulators can't receive push
  const existing = await Notifications.getPermissionsAsync()
  let final = existing
  if (existing.status !== 'granted') {
    final = await Notifications.requestPermissionsAsync()
  }
  if (final.status !== 'granted') return null

  // The `projectId` is Expo's — read from app.config.js `extra.eas.projectId`
  // once we adopt an EAS project. Until then we pass undefined and Expo
  // uses the classic FCM/APNs path implied by app.json.
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    ?? undefined

  try {
    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return res.data
  } catch {
    return null
  }
}

async function sendTokenToServer(token: string): Promise<void> {
  try {
    await client.post('/me/push-tokens', {
      token,
      platform: Platform.OS,
    })
  } catch {
    // Endpoint may not exist yet on the server (server-side dispatch is
    // a follow-up sprint). Silent — the token is still visible in
    // Expo's dev tools if we need to test push before the server
    // endpoint lands.
  }
}

export function useRegisterForPush(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const token = await fetchExpoToken()
      if (cancelled || !token) return
      // Log so we can copy it into Expo's push tool for smoke tests
      // before the server endpoint ships.
      console.log('[push] Expo push token', token)
      await sendTokenToServer(token)
    })()
    return () => { cancelled = true }
  }, [enabled])
}
