/**
 * ChatScreen — the FA's two-way chat.
 *
 * Two entry modes:
 *   1. { caseId, caseNumber? } — resolves (or lazy-creates) the job
 *      conversation for that case via chatApi.forCase. Case detail
 *      Chat button uses this shape.
 *   2. { conversationId, title? } — opens an existing conversation by
 *      id. Used by the chat inbox (direct + team chats) and by push
 *      notification tap deep-links.
 *
 * Mark-as-read fires once on mount so the desktop dispatcher's unread
 * badge clears the moment the FA opens the chat.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { chatApi, type ChatMessage } from '@api/chat'
import { useChatSocket } from '@hooks/useChatSocket'
import { useAuth } from '@store/auth'
import { colors, spacing, radii, typography } from '@theme/index'
import type { RootStackParamList } from '@navigation/RootNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>

export default function ChatScreen({ route, navigation }: Props) {
  // Union of the two entry modes — case-scoped or direct/team-scoped.
  const params = route.params as
    | { caseId: string; caseNumber?: string; conversationId?: undefined; title?: undefined }
    | { conversationId: string; title?: string; caseId?: undefined; caseNumber?: undefined }
  const caseId = 'caseId' in params ? params.caseId : undefined
  const caseNumber = 'caseNumber' in params ? params.caseNumber : undefined
  const directConversationId = 'conversationId' in params ? params.conversationId : undefined
  const directTitle = 'title' in params ? params.title : undefined
  const { user } = useAuth()
  const [conversationId, setConversationId] = useState<string | null>(directConversationId ?? null)
  const [loading, setLoading] = useState(!directConversationId)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList<ChatMessage>>(null)

  const chat = useChatSocket({ conversationId })

  useEffect(() => {
    const title = caseNumber ? `Chat · ${caseNumber}` : directTitle || 'Chat'
    navigation.setOptions({ title })
  }, [navigation, caseNumber, directTitle])

  // Case-scoped: resolve (or lazy-create) the job conversation.
  // Direct-scoped: conversationId is already known from the route param.
  useEffect(() => {
    if (directConversationId) return
    if (!caseId) return
    let cancelled = false
    void (async () => {
      try {
        const id = await chatApi.forCase(caseId)
        if (!cancelled) setConversationId(id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open chat')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [caseId, directConversationId])

  // Clear the unread badge on the dispatcher side once we're viewing.
  useEffect(() => {
    if (!conversationId) return
    void chatApi.markRead(conversationId)
  }, [conversationId])

  // Auto-scroll to the newest message when the list grows.
  useEffect(() => {
    if (chat.messages.length === 0) return
    const id = requestAnimationFrame(() => {
      try { listRef.current?.scrollToEnd({ animated: true }) } catch { /* ignore */ }
    })
    return () => cancelAnimationFrame(id)
  }, [chat.messages.length])

  const handleSend = useCallback(async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await chat.send(draft)
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }, [chat, draft, sending])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error && !conversationId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.statusBar}>
        <View style={[styles.dot, chat.connected ? styles.dotConn : styles.dotPoll]} />
        <Text style={styles.statusText}>
          {chat.connected ? 'Realtime' : 'Polling'}
        </Text>
        {chat.error && <Text style={styles.statusError} numberOfLines={1}>{chat.error}</Text>}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={chat.messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.authorUserId === user?.id
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && (
                    <Text style={styles.authorLabel}>{item.authorName ?? 'Someone'}</Text>
                  )}
                  <Text style={mine ? styles.bubbleTextMine : styles.bubbleText}>
                    {item.body}
                  </Text>
                  <Text style={mine ? styles.timestampMine : styles.timestamp}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>Send the first message — the dispatcher will see it in real time.</Text>
            </View>
          }
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => void handleSend()}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  dotConn: { backgroundColor: colors.success },
  dotPoll: { backgroundColor: colors.warning },
  statusText: { ...typography.micro, color: colors.textMuted },
  statusError: { ...typography.micro, color: colors.danger, flex: 1 },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: radii.sm },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radii.sm },
  authorLabel: { ...typography.micro, color: colors.textMuted, marginBottom: 2 },
  bubbleText: { ...typography.body, color: colors.text },
  bubbleTextMine: { ...typography.body, color: colors.textInverse },
  timestamp: { ...typography.micro, color: colors.textSubtle, marginTop: 2, alignSelf: 'flex-end' },
  timestampMine: { ...typography.micro, color: colors.primaryLight, marginTop: 2, alignSelf: 'flex-end' },
  composer: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.borderStrong },
  sendText: { ...typography.bodyB, color: colors.textInverse },
  empty: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  errorText: { ...typography.body, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  backBtn: { padding: spacing.md },
  backText: { color: colors.primary, ...typography.bodyB },
})
