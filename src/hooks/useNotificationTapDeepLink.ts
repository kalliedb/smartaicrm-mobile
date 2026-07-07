/**
 * useNotificationTapDeepLink — when the user taps a push, jump straight
 * to the case it references.
 *
 * Notification payload shape (agreed with the server, dispatched later):
 *   { data: { caseId: string, kind: 'chat_message' | 'case_assigned' | ... } }
 *
 * kind is informational — we always land on CaseDetail if there's a
 * caseId, and let CaseDetail's own logic show the right sub-view. Chat
 * kind bumps one level deeper into ChatScreen.
 */
import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import type { NavigationContainerRef } from '@react-navigation/native'
import type { RootStackParamList } from '@navigation/RootNavigator'

interface Payload {
  caseId?: string
  kind?: string
}

export function useNotificationTapDeepLink(
  navigationRef: React.MutableRefObject<NavigationContainerRef<RootStackParamList> | null>,
): void {
  // Guard: React Native may re-fire the "last response" on remount if we
  // don't ack it. Track the last-handled response id so we don't loop.
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    // 1. Cold-start case — app was closed, user tapped the notification.
    void (async () => {
      const response = await Notifications.getLastNotificationResponseAsync()
      if (response && response.notification.request.identifier !== handledRef.current) {
        handledRef.current = response.notification.request.identifier
        handle(response.notification.request.content.data as Payload)
      }
    })()

    // 2. Warm-start case — app was open (foreground or background) when
    //    the notification arrived.
    const sub = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      if (response.notification.request.identifier === handledRef.current) return
      handledRef.current = response.notification.request.identifier
      handle(response.notification.request.content.data as Payload)
    })

    return () => sub.remove()

    function handle(data: Payload) {
      const nav = navigationRef.current
      if (!nav?.isReady() || !data.caseId) return
      // Always ensure Cases is at the root of the stack so Back works.
      nav.reset({
        index: 1,
        routes: [
          { name: 'Cases' },
          data.kind === 'chat_message'
            ? { name: 'Chat', params: { caseId: data.caseId } }
            : { name: 'CaseDetail', params: { caseId: data.caseId } },
        ],
      })
    }
  }, [navigationRef])
}
