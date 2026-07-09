/**
 * useNotificationTapDeepLink — when the user taps a push, jump straight
 * to the right screen.
 *
 * Notification payload:
 *   { data: {
 *       caseId?: string,
 *       conversationId?: string,
 *       kind?: 'chat_message' | 'case_assigned' | 'case_completed',
 *   } }
 *
 * Routing precedence:
 *   1. kind='chat_message' + conversationId → Chat by id (direct/team/job)
 *   2. kind='chat_message' + caseId          → Chat by caseId (job)
 *   3. caseId (any other kind)               → CaseDetail
 *   4. neither present                       → do nothing
 */
import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import type { NavigationContainerRef } from '@react-navigation/native'
import type { RootStackParamList } from '@navigation/RootNavigator'

interface Payload {
  caseId?: string
  conversationId?: string
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
      if (!nav?.isReady()) return
      // Always ensure Cases is at the root of the stack so Back works.
      if (data.kind === 'chat_message' && data.conversationId) {
        // Direct / team / job — open by id (works when there's no caseId).
        nav.reset({
          index: 1,
          routes: [
            { name: 'Cases' },
            { name: 'Chat', params: { conversationId: data.conversationId } },
          ],
        })
        return
      }
      if (data.kind === 'chat_message' && data.caseId) {
        nav.reset({
          index: 1,
          routes: [
            { name: 'Cases' },
            { name: 'Chat', params: { caseId: data.caseId } },
          ],
        })
        return
      }
      if (data.caseId) {
        nav.reset({
          index: 1,
          routes: [
            { name: 'Cases' },
            { name: 'CaseDetail', params: { caseId: data.caseId } },
          ],
        })
      }
    }
  }, [navigationRef])
}
