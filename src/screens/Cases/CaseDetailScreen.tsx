/**
 * CaseDetailScreen — the FA's working surface for one case. Renders the
 * customer + site info, template description, and a stack of "advance"
 * buttons driven by the same state machine as the desktop portal.
 *
 * Special-case: on_site captures GPS via expo-location so the server can
 * geo-stamp the arrival. Permission and timeout are both best-effort —
 * a decline never blocks the status change.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import {
  casesApi, allowedNextStatuses,
  type ServiceCase, type ServiceCaseStatus,
} from '@api/cases'
import { colors, spacing, radii, typography } from '@theme/index'
import type { RootStackParamList } from '@navigation/RootNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'CaseDetail'>

// User-facing button labels — verbs, not statuses, because that's what
// the FA is actually doing at the moment they tap.
const ADVANCE_LABEL: Partial<Record<ServiceCaseStatus, string>> = {
  classified:     'Mark classified',
  assigned:       'Accept',
  dispatched:     'Dispatch',
  en_route:       'En-route',
  on_site:        'Arrived on site',
  in_progress:    'Start work',
  awaiting_parts: 'Awaiting parts',
  completed:      'Complete',
  invoiced:       'Send invoice',
  paid:           'Mark paid',
  closed:         'Close',
}

async function captureGeo(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') return undefined
    // Balanced accuracy is fast enough for a job-site pin; High takes ~5–10s.
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return undefined
  }
}

export default function CaseDetailScreen({ route, navigation }: Props) {
  const { caseId } = route.params
  const [existing, setExisting] = useState<ServiceCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [transitioning, setTransitioning] = useState<ServiceCaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await casesApi.get(caseId)
      setExisting(c)
      navigation.setOptions({ title: c.workOrderNumber })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case')
    } finally {
      setLoading(false)
    }
  }, [caseId, navigation])

  useEffect(() => { void load() }, [load])

  const advance = useCallback(async (next: ServiceCaseStatus) => {
    if (!existing) return
    setTransitioning(next)
    try {
      const geo = next === 'on_site' ? await captureGeo() : undefined
      const updated = await casesApi.transition(existing.id, next, geo)
      setExisting(updated)
    } catch (e) {
      Alert.alert('Status change failed', e instanceof Error ? e.message : 'Try again')
    } finally {
      setTransitioning(null)
    }
  }, [existing])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error || !existing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Case not found'}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const next = allowedNextStatuses(existing.status)

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerCard}>
          <Text style={styles.caseNumber}>{existing.workOrderNumber}</Text>
          <Text style={styles.customer}>{existing.customerName}</Text>
          <Text style={styles.status}>{existing.status.replace(/_/g, ' ')}</Text>
        </View>

        {/* Site */}
        {existing.siteAddress && (
          <Section title="Site">
            <Text style={styles.body}>{existing.siteAddress}</Text>
            {existing.customerPhone && (
              <Text style={styles.body}>{existing.customerPhone}</Text>
            )}
          </Section>
        )}

        {/* Description */}
        {existing.description && (
          <Section title="Description">
            <Text style={styles.body}>{existing.description}</Text>
          </Section>
        )}

        {/* Schedule */}
        {(existing.scheduledStart || existing.enRouteAt || existing.onSiteAt) && (
          <Section title="Timeline">
            {existing.scheduledStart && (
              <TimelineRow label="Scheduled" value={new Date(existing.scheduledStart).toLocaleString()} />
            )}
            {existing.enRouteAt && (
              <TimelineRow label="En-route" value={new Date(existing.enRouteAt).toLocaleString()} />
            )}
            {existing.onSiteAt && (
              <TimelineRow label="On-site" value={new Date(existing.onSiteAt).toLocaleString()} />
            )}
          </Section>
        )}

        {/* Advance actions */}
        {next.length > 0 && (
          <Section title="Advance">
            {next.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.advanceBtn, transitioning === s && styles.advanceBtnBusy]}
                onPress={() => void advance(s)}
                disabled={transitioning !== null}
              >
                {transitioning === s ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.advanceText}>
                    {ADVANCE_LABEL[s] ?? s.replace(/_/g, ' ')}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.md },
  headerCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  caseNumber: { ...typography.small, color: colors.primary, fontVariant: ['tabular-nums'], marginBottom: 4 },
  customer: { ...typography.h2, color: colors.text, marginBottom: 4 },
  status: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.micro, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionBody: { gap: spacing.sm },
  body: { ...typography.body, color: colors.text },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineLabel: { ...typography.small, color: colors.textMuted },
  timelineValue: { ...typography.small, color: colors.text },
  advanceBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  advanceBtnBusy: { opacity: 0.7 },
  advanceText: { ...typography.bodyB, color: colors.textInverse },
  errorText: { ...typography.body, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  backBtn: { padding: spacing.md },
  backText: { color: colors.primary, ...typography.bodyB },
})
