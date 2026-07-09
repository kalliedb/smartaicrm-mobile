/**
 * ChatInboxScreen — every conversation the FA is a participant in.
 *
 * Fixes the "dispatcher sent a direct message, FA never sees it" bug:
 * before Sprint G the mobile app only exposed job chats via the case
 * detail Chat button, so direct + team conversations landed in the DB
 * but had no UI to open them. This screen lists all three kinds with an
 * unread badge and taps through to ChatScreen with { conversationId }.
 *
 * Auto-refreshes when the tab regains focus so a fresh direct-message
 * push doesn't need a manual pull.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { chatApi, type ChatConversationSummary } from '@api/chat'
import { colors, spacing, radii, typography } from '@theme/index'
import type { RootStackParamList } from '@navigation/RootNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'ChatInbox'>

// Human-facing labels for the kind pill on each row.
const KIND_LABEL: Record<ChatConversationSummary['kind'], string> = {
  job:    'Case',
  direct: 'Direct',
  team:   'Team',
}
const KIND_TONE: Record<ChatConversationSummary['kind'], { bg: string; fg: string }> = {
  job:    { bg: '#DBEAFE', fg: '#1D4ED8' },
  direct: { bg: '#FEF3C7', fg: '#B45309' },
  team:   { bg: '#D1FAE5', fg: '#047857' },
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

export default function ChatInboxScreen({ navigation }: Props) {
  const [rows, setRows] = useState<ChatConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await chatApi.conversations()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chats')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Re-fetch when returning to this screen (after opening a chat) so
  // the unread counts and last-message times refresh.
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={c => c.id}
        contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyBody}>
              A case chat, direct message from a dispatcher, or team chat
              will appear here. Pull down to refresh.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = KIND_TONE[item.kind]
          const title = item.title || (item.kind === 'direct' ? 'Direct message' : 'Chat')
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('Chat', {
                conversationId: item.id,
                title,
              })}
              activeOpacity={0.7}
            >
              <View style={styles.rowTop}>
                <View style={[styles.kindPill, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.kindPillText, { color: tone.fg }]}>
                    {KIND_LABEL[item.kind]}
                  </Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.metaText}>
                  {item.lastMessageAt ? relativeTime(item.lastMessageAt) : 'No messages yet'}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.md },
  emptyList: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyCard: { alignItems: 'center', maxWidth: 320 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.md,
  },
  errorText: { color: colors.danger, ...typography.small },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  kindPillText: { ...typography.micro, fontWeight: '600' },
  title: { ...typography.bodyB, color: colors.text, flex: 1 },
  unreadBadge: {
    minWidth: 22, height: 22, paddingHorizontal: 6,
    borderRadius: 11, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { ...typography.micro, color: colors.textInverse, fontWeight: '700' },
  rowMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { ...typography.small, color: colors.textMuted },
})
