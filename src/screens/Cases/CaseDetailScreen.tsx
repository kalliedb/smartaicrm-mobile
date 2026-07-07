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
  ActivityIndicator, Alert, SafeAreaView, Image,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import {
  casesApi, allowedNextStatuses,
  type ServiceCase, type ServiceCaseStatus,
} from '@api/cases'
import { usePhotoAttach } from '@hooks/usePhotoAttach'
import SignatureModal from './SignatureModal'
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
  const [signatureOpen, setSignatureOpen] = useState(false)
  const photos = usePhotoAttach({ caseId })

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await casesApi.get(caseId)
      setExisting(c)
      navigation.setOptions({
        title: c.workOrderNumber,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { caseId: c.id, caseNumber: c.workOrderNumber })}
            style={styles.chatBtn}
          >
            <Text style={styles.chatBtnText}>Chat</Text>
          </TouchableOpacity>
        ),
      })
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

        {/* Photos */}
        <Section title="Photos">
          {photos.uploaded.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.uploaded.map(p => (
                <View key={p.id} style={styles.photoThumb}>
                  {/* stub:// URIs are placeholders — no preview possible until
                     real cloud storage lands (backlog task #48). Show a chip. */}
                  {p.fileUrl.startsWith('http') ? (
                    <Image source={{ uri: p.fileUrl }} style={styles.photoImg} />
                  ) : (
                    <View style={styles.photoStub}>
                      <Text style={styles.photoStubText}>uploaded</Text>
                    </View>
                  )}
                  <Text style={styles.photoName} numberOfLines={1}>{p.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>No photos yet.</Text>
          )}
          {photos.error && <Text style={styles.errorInline}>{photos.error}</Text>}
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={[styles.sectionBtn, photos.uploading && styles.btnBusy]}
              onPress={() => void photos.pickFromCamera()}
              disabled={photos.uploading}
            >
              <Text style={styles.sectionBtnText}>
                {photos.uploading ? 'Uploading…' : 'Take photo'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sectionBtnGhost, photos.uploading && styles.btnBusy]}
              onPress={() => void photos.pickFromLibrary()}
              disabled={photos.uploading}
            >
              <Text style={styles.sectionBtnGhostText}>Pick from gallery</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Signature */}
        <Section title="Customer signature">
          {existing.customerSignatureUrl ? (
            <Text style={styles.body}>Captured ✓</Text>
          ) : (
            <Text style={styles.hint}>Capture the customer signature before completing.</Text>
          )}
          <TouchableOpacity
            style={styles.sectionBtn}
            onPress={() => setSignatureOpen(true)}
          >
            <Text style={styles.sectionBtnText}>
              {existing.customerSignatureUrl ? 'Re-capture signature' : 'Capture signature'}
            </Text>
          </TouchableOpacity>
        </Section>

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

      <SignatureModal
        visible={signatureOpen}
        caseId={existing.id}
        onClose={() => setSignatureOpen(false)}
        onCaptured={async (fileUrl) => {
          try {
            const updated = await casesApi.update(existing.id, { customerSignatureUrl: fileUrl })
            setExisting(updated)
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again')
          }
        }}
      />
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
  errorInline: { ...typography.small, color: colors.danger },
  backBtn: { padding: spacing.md },
  backText: { color: colors.primary, ...typography.bodyB },
  hint: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoThumb: { width: 80, gap: 4 },
  photoImg: { width: 80, height: 80, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
  photoStub: {
    width: 80, height: 80,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  photoStubText: { ...typography.micro, color: colors.primaryDark, fontWeight: '600' },
  photoName: { ...typography.micro, color: colors.textSubtle },
  rowBtns: { flexDirection: 'row', gap: spacing.sm },
  sectionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  sectionBtnText: { ...typography.bodyB, color: colors.textInverse },
  sectionBtnGhost: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sectionBtnGhostText: { ...typography.bodyB, color: colors.text },
  btnBusy: { opacity: 0.7 },
  chatBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chatBtnText: { ...typography.bodyB, color: colors.primary },
})
