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
  View, Text, StyleSheet, FlatList, RefreshControl, Modal,
  TouchableOpacity, ActivityIndicator, SafeAreaView, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { chatApi, type ChatConversationSummary, type TenantUser } from '@api/chat'
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
  // Sprint Q2 — "+ New chat" picker. Fetches tenant users on first open
  // and lets the FA start a direct conversation with anyone (dispatchers,
  // admins, other FAs). Server de-dupes existing 1:1s.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [creating, setCreating] = useState(false)

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

  // Lazy-load users on first modal open, then cache for the session.
  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    if (users.length > 0) return
    try {
      const list = await chatApi.tenantUsers()
      // Sort so dispatchers / admins land at the top — that's who the FA
      // is most likely reaching for.
      const rank: Record<string, number> = {
        admin: 0, platform_admin: 0, manager: 1, dispatcher: 1, field_agent: 2, user: 3, viewer: 4,
      }
      list.sort((a, b) => (rank[a.role] ?? 5) - (rank[b.role] ?? 5))
      setUsers(list)
    } catch (e) {
      Alert.alert('Could not load users', e instanceof Error ? e.message : 'Try again')
      setPickerOpen(false)
    }
  }, [users.length])

  useEffect(() => {
    // Rewire header button to use openPicker (which loads on demand)
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => void openPicker()} style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      ),
    })
  }, [navigation, openPicker])

  const startDirect = useCallback(async (u: TenantUser) => {
    setCreating(true)
    try {
      const r = await chatApi.createConversation({ kind: 'direct', participantUserIds: [u.id] })
      setPickerOpen(false)
      navigation.navigate('Chat', {
        conversationId: r.id,
        title: u.name || u.email || 'Direct message',
      })
    } catch (e) {
      Alert.alert('Could not start chat', e instanceof Error ? e.message : 'Try again')
    } finally {
      setCreating(false)
    }
  }, [navigation])

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

      {/* Sprint Q2 — direct-chat picker. Opens from the header "+ New"
         button. Lists tenant users (admins/managers first) and starts
         a direct conversation on tap. Server de-dupes existing 1:1s. */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start a direct chat</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {users.length === 0 ? (
              <View style={styles.modalCenter}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>Loading team…</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={u => u.id}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => void startDirect(item)}
                    disabled={creating}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{item.name || item.email || 'User'}</Text>
                      <Text style={styles.userMeta}>
                        {item.role.replace(/_/g, ' ')}{item.email && item.name ? ` · ${item.email}` : ''}
                      </Text>
                    </View>
                    {creating && <ActivityIndicator size="small" color={colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
  newBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  newBtnText: { ...typography.small, color: colors.textInverse, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '75%',
    paddingBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.h3, color: colors.text },
  modalClose: { ...typography.small, color: colors.primary, fontWeight: '600' },
  modalCenter: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  hint: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  userName: { ...typography.bodyB, color: colors.text },
  userMeta: { ...typography.micro, color: colors.textMuted, textTransform: 'capitalize' },
})
