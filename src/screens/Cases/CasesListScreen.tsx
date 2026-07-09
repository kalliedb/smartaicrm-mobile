/**
 * CasesListScreen — the FA's home. Lists cases assigned to them (the
 * server enforces the assignedUserId = me scope), with pull-to-refresh
 * and a colour-coded status badge.
 *
 * Tapping a row navigates to CaseDetailScreen for that case id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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

// Filter buckets on the FA case list. Default view hides cases the FA
// has already finished on so the list stays focused on today's work.
type FilterKey = 'active' | 'new' | 'in_progress' | 'closed' | 'all'

const FILTER_LABELS: Record<FilterKey, string> = {
  active: 'Active',
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
  all: 'All',
}

const NEW_STATUSES = new Set<ServiceCaseStatus>([
  'new', 'logged', 'classified', 'assigned', 'dispatched', 'scheduled',
])
const IN_PROGRESS_STATUSES = new Set<ServiceCaseStatus>([
  'en_route', 'on_site', 'in_progress', 'awaiting_parts', 'on_hold',
])
const CLOSED_STATUSES = new Set<ServiceCaseStatus>([
  'completed', 'invoiced', 'paid', 'closed', 'cancelled',
])

function inFilter(status: ServiceCaseStatus, key: FilterKey): boolean {
  switch (key) {
    case 'all':         return true
    case 'active':      return !CLOSED_STATUSES.has(status)
    case 'new':         return NEW_STATUSES.has(status)
    case 'in_progress': return IN_PROGRESS_STATUSES.has(status)
    case 'closed':      return CLOSED_STATUSES.has(status)
  }
}

export default function CasesListScreen({ navigation }: Props) {
  const { user, logout } = useAuth()
  const outbox = useOutboxDrain()
  const [cases, setCases] = useState<ServiceCase[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Default to Active — hides completed / invoiced / paid / closed /
  // cancelled so the FA's list stays focused on today's outstanding work.
  const [filter, setFilter] = useState<FilterKey>('active')

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

  // Buckets used for the filter chip labels + the visible list.
  const counts = useMemo(() => ({
    active:      cases.filter(c => inFilter(c.status, 'active')).length,
    new:         cases.filter(c => inFilter(c.status, 'new')).length,
    in_progress: cases.filter(c => inFilter(c.status, 'in_progress')).length,
    closed:      cases.filter(c => inFilter(c.status, 'closed')).length,
    all:         cases.length,
  }), [cases])
  const visibleCases = useMemo(
    () => cases.filter(c => inFilter(c.status, filter)),
    [cases, filter],
  )

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

      {/* Filter chips — Active is the default so Closed/Cancelled cases
         are out of the way. Tap Closed or All to review historic work. */}
      <View style={styles.filterRow}>
        {(['active', 'new', 'in_progress', 'closed', 'all'] as FilterKey[]).map(k => {
          const selected = filter === k
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setFilter(k)}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                {FILTER_LABELS[k]}
                <Text style={selected ? styles.filterCountSelected : styles.filterCount}>
                  {'  '}{counts[k]}
                </Text>
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <FlatList
        data={visibleCases}
        keyExtractor={c => c.id}
        contentContainerStyle={visibleCases.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {cases.length === 0 ? 'Nothing assigned yet' : `No ${FILTER_LABELS[filter].toLowerCase()} cases`}
            </Text>
            <Text style={styles.emptyBody}>
              {cases.length === 0
                ? 'When a dispatcher assigns you a case it will appear here. Pull down to refresh.'
                : 'Try another filter above or pull down to refresh.'}
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  filterChipText: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  filterChipTextSelected: { color: colors.textInverse },
  filterCount: { color: colors.textSubtle, fontWeight: '400' },
  filterCountSelected: { color: colors.textInverse, opacity: 0.85, fontWeight: '400' },
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
