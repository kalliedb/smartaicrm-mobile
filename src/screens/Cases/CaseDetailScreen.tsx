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
  casesApi,
  type ServiceCase, type ServiceCaseStatus,
} from '@api/cases'
import { templatesApi, type CaseTemplate } from '@api/templates'
import { usePhotoAttach } from '@hooks/usePhotoAttach'
import SignatureModal from './SignatureModal'
import TemplateForm, { validateFormData } from '@components/TemplateForm'
import { type TravelLabour } from '@components/TravelLabourSection'
import WorkflowStrip from '@components/WorkflowStrip'
import { enqueue } from '@utils/outbox'

function isNetworkError(e: unknown): boolean {
  const err = e as { response?: unknown; message?: string }
  if (err?.response) return false
  const msg = err?.message ?? ''
  return /Network Error|Failed to fetch|timeout|ENOTFOUND|abort/i.test(msg)
}
import { colors, spacing, radii, typography } from '@theme/index'
import type { RootStackParamList } from '@navigation/RootNavigator'

type Props = NativeStackScreenProps<RootStackParamList, 'CaseDetail'>

// User-facing button labels — verbs, not statuses, because that's what
// the FA is actually doing at the moment they tap.
// Sprint T — advance labels moved into WorkflowStrip.tsx (each cell
// carries its own label alongside its ancillary controls). Retained
// here in intent only.

function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60)   return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m} min${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
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
  const [template, setTemplate] = useState<CaseTemplate | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [savingForm, setSavingForm] = useState(false)
  const [travelLabour, setTravelLabour] = useState<TravelLabour>({})
  const photos = usePhotoAttach({ caseId })

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await casesApi.get(caseId)
      setExisting(c)
      // Hydrate template + prior form data if the case is classified.
      if (c.classificationTemplateId) {
        try {
          const tpl = await templatesApi.get(c.classificationTemplateId)
          setTemplate(tpl)
        } catch { setTemplate(null) }
      }
      // Existing templateData may already be the envelope shape (from a
      // prior partial submission on the web) OR the inner form_data bag.
      // Normalise to the inner bag for editing.
      const td = c.templateData ?? {}
      const inner = (td && typeof td === 'object' && 'form_data' in td)
        ? (td as { form_data?: Record<string, unknown> }).form_data ?? {}
        : td as Record<string, unknown>
      setFormData(inner)
      // v2.0 travel_labour lives at the envelope top-level. Fall back to
      // an empty object if the case pre-dates v2.0.
      const tl = (td && typeof td === 'object' && 'travel_labour' in td)
        ? ((td as { travel_labour?: TravelLabour }).travel_labour ?? {})
        : {}
      setTravelLabour(tl)
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

  // Auto-save the form data as the FA fills it. Debounced (2s) so we
  // don't PATCH on every keystroke. Sends the RAW bag (not the envelope)
  // so the server treats it as a scratchpad edit — full envelope
  // validation runs only on Complete.
  useEffect(() => {
    if (!existing || !template) return
    setSavingForm(true)
    const timer = setTimeout(async () => {
      try {
        // Persist an envelope-shaped scratchpad so travel_labour survives
        // page reloads. Server accepts partial envelopes on PATCH; strict
        // validation runs only on Complete.
        await casesApi.update(existing.id, {
          templateData: { form_data: formData, travel_labour: travelLabour } as unknown as ServiceCase['templateData'],
        })
      } catch { /* silent — network errors surface via other paths */ }
      finally { setSavingForm(false) }
    }, 2000)
    return () => { clearTimeout(timer); setSavingForm(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, travelLabour])

  const advance = useCallback(async (next: ServiceCaseStatus) => {
    if (!existing) return

    // Completing → validate + submit envelope. Templates require the
    // full { template_id, header, form_data } shape, so we build it
    // from the current bag first. Server ajv is authoritative.
    if (next === 'completed' && template) {
      const localErrors = validateFormData(template.jsonSchema, formData)
      if (localErrors.length > 0) {
        Alert.alert(
          'Fields required',
          localErrors.slice(0, 5).join('\n') + (localErrors.length > 5 ? '\n…' : ''),
        )
        return
      }
      setTransitioning(next)
      try {
        const templateCode = (template.jsonSchema.properties as Record<string, unknown> | undefined)
          ?.template_id
        const envelope = {
          template_id: (templateCode as { const?: string } | undefined)?.const ?? template.code,
          template_version: template.templateVersion,
          header: {
            case_number: existing.workOrderNumber,
            customer_id: existing.customerCompanyId ?? '00000000-0000-0000-0000-000000000000',
            site_address: existing.siteAddress ?? 'Unknown',
            agent_id: existing.assignedUserId ?? '00000000-0000-0000-0000-000000000000',
            scheduled_at: existing.scheduledStart ?? new Date().toISOString(),
            arrived_at: existing.onSiteAt,
            completed_at: new Date().toISOString(),
          },
          travel_labour: travelLabour,
          form_data: formData,
        }
        await casesApi.update(existing.id, {
          templateData: envelope as unknown as ServiceCase['templateData'],
        })
        const updated = await casesApi.transition(existing.id, next)
        setExisting(updated)

        // v2.0 Follow-up trigger — when the FA closed the case with
        // case_outcome_status="Follow-up", prompt to spawn a child case
        // with the parent details pre-populated.
        if (formData.case_outcome_status === 'Follow-up') {
          Alert.alert(
            'Create follow-up?',
            'This case was closed as Follow-up. Spawn a new case with the customer, contact, and line items pre-populated?',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Create follow-up',
                onPress: async () => {
                  try {
                    const child = await casesApi.followUp(existing.id)
                    navigation.replace('CaseDetail', { caseId: child.id })
                  } catch (e) {
                    Alert.alert('Follow-up failed', e instanceof Error ? e.message : 'Try again from the case detail.')
                  }
                },
              },
            ],
          )
        }
      } catch (e) {
        Alert.alert('Complete failed', e instanceof Error ? e.message : 'Try again')
      } finally { setTransitioning(null) }
      return
    }

    setTransitioning(next)
    try {
      const geo = next === 'on_site' ? await captureGeo() : undefined
      try {
        const updated = await casesApi.transition(existing.id, next, geo)
        setExisting(updated)
      } catch (e) {
        // Offline queues the transition; when the outbox drains, the
        // desktop dispatcher sees the status change with the original
        // GPS coords. Show an optimistic local state change so the FA
        // isn't stuck staring at the previous status.
        if (isNetworkError(e)) {
          await enqueue({ kind: 'case_status', caseId: existing.id, next, geo })
          setExisting({ ...existing, status: next })
          Alert.alert('No signal', 'Status queued — will send when signal returns.')
          return
        }
        throw e
      }
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header — the case's latest status is authoritative (was
           previously the raw lowercase enum, which looked stale after
           the FA advanced through several transitions). Title-cased
           and paired with an "updated X ago" hint. */}
        <View style={styles.headerCard}>
          <Text style={styles.caseNumber}>{existing.workOrderNumber}</Text>
          <Text style={styles.customer}>{existing.customerName}</Text>
          <Text style={styles.status}>
            {existing.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Text>
          {existing.updatedAt && (
            <Text style={styles.statusHint}>Updated {ago(existing.updatedAt)}</Text>
          )}
        </View>

        {/* Sprint T — GENERAL section in exact operator spec order:
           Customer · Priority · Scheduled Start · Assign to Field Agent
           · Contact Person · Contact Number · Site Address · Brief
           Description. Rendered read-only on mobile (edits happen on
           the portal). */}
        <Section title="GENERAL">
          <TimelineRow label="Customer" value={existing.customerName} />
          <TimelineRow
            label="Priority"
            value={existing.priority
              ? existing.priority.replace(/\b\w/g, c => c.toUpperCase())
              : '—'}
          />
          <TimelineRow
            label="Scheduled Start"
            value={existing.scheduledStart ? new Date(existing.scheduledStart).toLocaleString() : '—'}
          />
          <TimelineRow
            label="Assign to Field Agent"
            value={existing.assignedUserName || existing.assignedUserEmail || '—'}
          />
          <TimelineRow label="Contact Person" value={existing.contactPerson || '—'} />
          <TimelineRow label="Contact Number" value={existing.customerPhone || '—'} />
          <TimelineRow label="Site Address" value={existing.siteAddress || '—'} />
          <TimelineRow label="Brief Description" value={existing.description || '—'} />
        </Section>

        {/* Sprint T — WORKFLOW section as a horizontal step strip. Each
           cell owns its ancillary controls (GPS / time / km / hh:mm).
           Tapping the current cell advances the status, that cell moves
           to "done", and the next cell becomes primary. */}
        <Section title="WORKFLOW">
          <WorkflowStrip
            status={existing.status}
            transitioning={transitioning}
            onAdvance={s => void advance(s)}
            travelLabour={travelLabour}
            onTravelLabourChange={setTravelLabour}
            disabled={
              existing.status === 'completed'
              || existing.status === 'closed'
              || existing.status === 'cancelled'
            }
          />
        </Section>

        {/* Sprint T — RESOLUTION section (was "Case Type · X"). Schema-
           driven form for the picked template; the six generic fields
           + case_photos + attachments are all rendered by TemplateForm. */}
        {template && (
          <Section title={`RESOLUTION · ${template.name}`}>
            <TemplateForm
              jsonSchema={template.jsonSchema}
              value={formData}
              onChange={setFormData}
              disabled={
                existing.status === 'completed'
                || existing.status === 'closed'
                || existing.status === 'cancelled'
              }
            />
            {savingForm && (
              <Text style={styles.savingHint}>Saving…</Text>
            )}
          </Section>
        )}

        {/* Photos */}
        <Section title="Photos">
          {photos.uploaded.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.uploaded.map(p => (
                <View key={p.id} style={styles.photoThumb}>
                  {/* Sprint U — R2 storage means every fileUrl is a real
                     https://cdn.aivera.solutions/... URL. Legacy stub://
                     rows from before Sprint U keep their placeholder
                     branch so old test data doesn't crash the grid. */}
                  {p.fileUrl.startsWith('http') ? (
                    <Image source={{ uri: p.fileUrl }} style={styles.photoImg} />
                  ) : (
                    <View style={styles.photoStub}>
                      <Text style={styles.photoStubText}>legacy</Text>
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

        {/* Sprint T — Section 4 in the spec: CUSTOMER (was "Customer
           signature"). Signature capture only. */}
        <Section title="CUSTOMER">
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
  status: { ...typography.small, color: colors.primary, fontWeight: '700', letterSpacing: 0.4 },
  statusHint: { ...typography.micro, color: colors.textSubtle, marginTop: 2 },
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
  savingHint: { ...typography.micro, color: colors.textSubtle, textAlign: 'right' },
})
