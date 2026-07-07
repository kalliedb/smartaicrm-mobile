/**
 * CasesListScreen — the FA's home. Lists cases assigned to them (the
 * server enforces the assignedUserId = me scope), with pull-to-refresh
 * and a colour-coded status badge.
 *
 * Tapping a row navigates to CaseDetailScreen for that case id.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { casesApi, type ServiceCase, type ServiceCaseStatus } from '@api/cases'
import { useAuth } from '@store/auth'
import { useOutboxDrain } from '@hooks/useOutboxDrain'
import { colors, spacing, radii, typography } from '@theme/index'
import type { RootStackParamList } from '@navigation/RootNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'Cases'>

const STATUS_LABEL: Partial<Record<ServiceCaseStatus, string>> = {
  logged: 'Logged', classified: 'Classified', assigned: 'Assigned',
  dispatched: 'Dispatched', en_route: 'En-route', on_site: 'On-site',
  in_progress: 'In Progress', awaiting_parts: 'Awaiting Parts',
  completed: 'Completed', invoiced: 'Invoiced', paid: 'Paid', closed: 'Closed',
  cancelled: 'Cancelled', on_hold: 'On Hold',
  new: 'New', scheduled: 'Scheduled',
}

const STATUS_TONE: Partial<Record<ServiceCaseStatus, { bg: string; fg: string }>> = {
  assigned:       { bg: '#FEF3C7', fg: '#B45309' },
  dispatched:     { bg: '#FEF3C7', fg: '#B45309' },
  en_route:       { bg: '#DBEAFE', fg: '#1D4ED8' },
  on_site:        { bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress:    { bg: '#DBEAFE', fg: '#1D4ED8' },
  awaiting_parts: { bg: '#FED7AA', fg: '#C2410C' },
  completed:      { bg: '#D1FAE5', fg: '#047857' },
  invoiced:       { bg: '#D1FAE5', fg: '#047857' },
  paid:           { bg: '#D1FAE5', fg: '#047857' },
  closed:         { bg: '#E2E8F0', fg: '#475569' },
  cancelled:      { bg: '#FECACA', fg: '#B91C1C' },
}

export default function CasesListScreen({ navigation }: Props) {
  const { user, logout } = useAuth()
  const outbox = useOutboxDrain()
  const [cases, setCases] = useState<ServiceCase[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const rows = await casesApi.list()
      setCases(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cases')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

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
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Cases</Text>
          <Text style={styles.subtitle}>{user?.name ?? user?.email ?? 'Field agent'}</Text>
        </View>
        <TouchableOpacity onPress={() => void logout()} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {outbox.pending > 0 && (
        <TouchableOpacity
          style={styles.outboxBanner}
          onPress={() => void outbox.attemptDrain()}
          disabled={outbox.draining}
        >
          <Text style={styles.outboxText}>
            {outbox.draining
              ? `Syncing ${outbox.pending} queued item${outbox.pending === 1 ? '' : 's'}…`
              : `${outbox.pending} item${outbox.pending === 1 ? '' : 's'} queued — tap to retry`}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={cases}
        keyExtractor={c => c.id}
        contentContainerStyle={cases.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing assigned yet</Text>
            <Text style={styles.emptyBody}>
              When a dispatcher assigns you a case it will appear here. Pull
              down to refresh.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = STATUS_TONE[item.status] ?? { bg: colors.surfaceMuted, fg: colors.textMuted }
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('CaseDetail', { caseId: item.id })}
              activeOpacity={0.7}
            >
              <View style={styles.rowTop}>
                <Text style={styles.caseNumber}>{item.workOrderNumber}</Text>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.customer}>{item.customerName}</Text>
              {item.siteAddress && (
                <Text style={styles.address} numberOfLines={2}>{item.siteAddress}</Text>
              )}
              {item.description && (
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  logoutBtn: { padding: spacing.sm },
  logoutText: { ...typography.small, color: colors.primary },
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
  outboxBanner: {
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.md,
  },
  outboxText: { ...typography.small, color: '#B45309', textAlign: 'center' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  caseNumber: { ...typography.bodyB, color: colors.primary, fontVariant: ['tabular-nums'] },
  customer: { ...typography.bodyB, color: colors.text, marginBottom: spacing.xs },
  address: { ...typography.small, color: colors.textMuted, marginBottom: spacing.xs },
  description: { ...typography.small, color: colors.textSubtle },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  badgeText: { ...typography.micro, fontWeight: '600' },
})
