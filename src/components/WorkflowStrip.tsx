/**
 * WorkflowStrip — horizontal step-strip for the FA's case workflow.
 *
 * Renders the whole assigned → complete lifecycle as a single row of
 * pill cards. Each cell has three states:
 *   - done     → dimmed with ✓ tick, non-interactive
 *   - current  → bright primary + tap-to-advance
 *   - future   → dim/grey + non-interactive
 *
 * Sub-controls (Start/End GPS, Time Start/End buttons, km, HH:mm) live
 * INSIDE their owning step card so all the FA sees is one horizontal
 * timeline. When the current step's button is tapped, that cell moves
 * to "done" and the next cell becomes current — the "button removed +
 * next moves up" behaviour the operator asked for.
 *
 * Two side branches (Awaiting Parts, Pending Customer) sit after
 * "End Work" as amber-outlined shortcuts — visible + tappable only
 * while the case is at in_progress or downstream of it.
 */
import { useMemo } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, StyleSheet,
} from 'react-native'
import * as Location from 'expo-location'
import type { ServiceCaseStatus } from '@api/cases'
import type { TravelLabour } from './TravelLabourSection'
import { colors, spacing, radii, typography } from '@theme/index'

interface Props {
  status: ServiceCaseStatus
  transitioning: ServiceCaseStatus | null
  onAdvance: (next: ServiceCaseStatus) => void
  travelLabour: TravelLabour
  onTravelLabourChange: (next: TravelLabour) => void
  disabled?: boolean
}

// The exact sequence + labels from the operator's workflow doc.
// Order matters — LINEAR is the happy path; BRANCHES sit alongside.
const LINEAR: Array<{ step: ServiceCaseStatus; label: string }> = [
  { step: 'assigned',    label: 'Assigned' },      // start state — no advance from here on mobile
  { step: 'en_route',    label: 'Acknowledge' },   // FA taps this on an assigned case
  { step: 'on_site',     label: 'En Route' },      // taps to arrive
  { step: 'in_progress', label: 'On Site' },       // "Start Work" cell — press to enter in_progress
  { step: 'completed',   label: 'End Work' },      // press to end work → completed
]
const BRANCHES: Array<{ step: ServiceCaseStatus; label: string }> = [
  { step: 'awaiting_parts', label: 'Awaiting Parts' },
  { step: 'on_hold',        label: 'Pending Customer' },
]
const CLOSE: Array<{ step: ServiceCaseStatus; label: string }> = [
  { step: 'closed', label: 'Complete' },
]

// Ordinal-position helper — done/current/future decision.
function rank(s: ServiceCaseStatus): number {
  switch (s) {
    case 'assigned':       return 0
    case 'en_route':       return 1
    case 'on_site':        return 2
    case 'in_progress':    return 3
    case 'awaiting_parts': return 3   // side branch of in_progress
    case 'on_hold':        return 3   // side branch of in_progress
    case 'completed':      return 4
    case 'closed':         return 5
    default:               return -1  // logged, cancelled, retired legacy
  }
}

async function captureGps(): Promise<{ lat: number; lng: number; accuracy_m?: number; at: string } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Location denied', 'Enable location in Settings to stamp GPS.')
      return null
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ?? undefined,
      at: new Date(pos.timestamp).toISOString(),
    }
  } catch {
    Alert.alert('GPS failed', 'Could not read the device location. Try again outdoors.')
    return null
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function parseHHmmToISO(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  const h = Math.min(23, parseInt(m[1], 10))
  const mm = Math.min(59, parseInt(m[2], 10))
  const d = new Date()
  d.setHours(h, mm, 0, 0)
  return d.toISOString()
}
function fmtHHmm(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function WorkflowStrip({
  status, transitioning, onAdvance, travelLabour, onTravelLabourChange, disabled,
}: Props) {
  // Auto-recompute km + hours as travelLabour changes.
  const derived = useMemo(() => {
    const next: TravelLabour = { ...travelLabour }
    if (travelLabour.start_gps && travelLabour.end_gps && !travelLabour.kilometers_manual_override) {
      next.kilometers_travelled = Math.round(haversineKm(travelLabour.start_gps, travelLabour.end_gps) * 10) / 10
    }
    if (travelLabour.time_start && travelLabour.time_end) {
      const ms = new Date(travelLabour.time_end).getTime() - new Date(travelLabour.time_start).getTime()
      if (ms > 0) next.total_hours = Math.round((ms / 3600000) * 100) / 100
    }
    return next
  }, [travelLabour])
  const drift =
    derived.kilometers_travelled !== travelLabour.kilometers_travelled ||
    derived.total_hours          !== travelLabour.total_hours
  if (drift) setTimeout(() => onTravelLabourChange(derived), 0)

  const r = rank(status)
  const cellState = (target: ServiceCaseStatus): 'done' | 'current' | 'future' => {
    const targetRank = rank(target)
    if (targetRank < r) return 'done'
    if (targetRank === r) return 'current'
    return 'future'
  }
  const canTapBranch = r >= 3 && status === 'in_progress'

  const stampStart = async () => {
    const g = await captureGps()
    if (g) onTravelLabourChange({ ...travelLabour, start_gps: g, time_start: travelLabour.time_start ?? g.at })
  }
  const stampEnd = async () => {
    const g = await captureGps()
    if (g) onTravelLabourChange({ ...travelLabour, end_gps: g, time_end: travelLabour.time_end ?? g.at })
  }
  const stampTimeStart = () => onTravelLabourChange({ ...travelLabour, time_start: new Date().toISOString() })
  const stampTimeEnd   = () => onTravelLabourChange({ ...travelLabour, time_end:   new Date().toISOString() })

  const renderLinearCell = ({ step, label }: { step: ServiceCaseStatus; label: string }, i: number) => {
    const state = cellState(step)
    // Ancillary controls per step, per the workflow doc.
    const controls: React.ReactNode[] = []
    if (step === 'on_site') {
      // "Acknowledge" cell owns the Start-GPS control per the doc.
      controls.push(
        <TouchableOpacity key="gps-start"
          style={[styles.subBtn, travelLabour.start_gps && styles.subBtnDone]}
          onPress={() => void stampStart()}
          disabled={disabled}
        >
          <Text style={styles.subBtnText}>{travelLabour.start_gps ? '✓ Start GPS' : 'Start GPS'}</Text>
        </TouchableOpacity>,
      )
    }
    if (step === 'in_progress') {
      // "On Site" cell owns End-GPS + Kilometres.
      controls.push(
        <TouchableOpacity key="gps-end"
          style={[styles.subBtn, travelLabour.end_gps && styles.subBtnDone]}
          onPress={() => void stampEnd()}
          disabled={disabled}
        >
          <Text style={styles.subBtnText}>{travelLabour.end_gps ? '✓ End GPS' : 'End GPS'}</Text>
        </TouchableOpacity>,
      )
      controls.push(
        <TextInput key="km"
          style={styles.subInput}
          value={travelLabour.kilometers_travelled != null ? String(travelLabour.kilometers_travelled) : ''}
          onChangeText={txt => {
            if (txt.trim() === '') {
              onTravelLabourChange({ ...travelLabour, kilometers_travelled: null, kilometers_manual_override: false })
              return
            }
            const n = parseFloat(txt)
            onTravelLabourChange({
              ...travelLabour,
              kilometers_travelled: Number.isNaN(n) ? null : n,
              kilometers_manual_override: true,
            })
          }}
          placeholder="km"
          placeholderTextColor={colors.textSubtle}
          keyboardType="numeric"
          editable={!disabled}
        />,
      )
    }
    if (step === 'completed') {
      // "End Work" cell owns Time Start/End buttons + HH:mm overrides + hours.
      controls.push(
        <TouchableOpacity key="ts"
          style={[styles.subBtn, travelLabour.time_start && styles.subBtnDone]}
          onPress={stampTimeStart} disabled={disabled}
        >
          <Text style={styles.subBtnText}>{travelLabour.time_start ? '✓ Time Start' : 'Time Start'}</Text>
        </TouchableOpacity>,
      )
      controls.push(
        <TouchableOpacity key="te"
          style={[styles.subBtn, travelLabour.time_end && styles.subBtnDone]}
          onPress={stampTimeEnd} disabled={disabled}
        >
          <Text style={styles.subBtnText}>{travelLabour.time_end ? '✓ Time End' : 'Time End'}</Text>
        </TouchableOpacity>,
      )
      controls.push(
        <View key="hhmm" style={styles.hhmmRow}>
          <TextInput
            style={styles.hhmmInput}
            value={fmtHHmm(travelLabour.time_start)}
            onChangeText={txt => onTravelLabourChange({ ...travelLabour, time_start: parseHHmmToISO(txt) })}
            placeholder="08:15"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            editable={!disabled}
          />
          <Text style={styles.hhmmSep}>/</Text>
          <TextInput
            style={styles.hhmmInput}
            value={fmtHHmm(travelLabour.time_end)}
            onChangeText={txt => onTravelLabourChange({ ...travelLabour, time_end: parseHHmmToISO(txt) })}
            placeholder="16:30"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            editable={!disabled}
          />
        </View>,
      )
      if (travelLabour.total_hours != null) {
        controls.push(
          <Text key="hrs" style={styles.hoursText}>{travelLabour.total_hours.toFixed(2)} h</Text>,
        )
      }
    }

    const clickable = state === 'current' && !disabled
    return (
      <View key={step + '-' + i} style={[styles.cell, cellStyleFor(state)]}>
        <TouchableOpacity
          activeOpacity={clickable ? 0.7 : 1}
          onPress={clickable ? () => onAdvance(step) : undefined}
          style={styles.cellHead}
          disabled={!clickable}
        >
          {transitioning === step ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={cellLabelStyleFor(state)}>
              {state === 'done' ? '✓ ' : ''}{label}
            </Text>
          )}
        </TouchableOpacity>
        {controls.length > 0 && (
          <View style={styles.subControls}>{controls}</View>
        )}
      </View>
    )
  }

  const renderBranchCell = ({ step, label }: { step: ServiceCaseStatus; label: string }) => {
    const state = cellState(step)
    const clickable = canTapBranch && state !== 'done' && !disabled
    return (
      <View key={step} style={[styles.cellBranch, state === 'done' && styles.cellDone]}>
        <TouchableOpacity
          activeOpacity={clickable ? 0.7 : 1}
          onPress={clickable ? () => onAdvance(step) : undefined}
          style={styles.cellHead}
          disabled={!clickable}
        >
          {transitioning === step ? (
            <ActivityIndicator color={colors.warning} size="small" />
          ) : (
            <Text style={styles.cellBranchLabel}>
              {state === 'done' ? '✓ ' : ''}{label}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {LINEAR.map(renderLinearCell)}
      {BRANCHES.map(renderBranchCell)}
      {CLOSE.map(renderLinearCell)}
    </ScrollView>
  )
}

function cellStyleFor(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.cellCurrent
       : state === 'done'    ? styles.cellDone
       : styles.cellFuture
}
function cellLabelStyleFor(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.cellLabelCurrent
       : state === 'done'    ? styles.cellLabelDone
       : styles.cellLabelFuture
}

const CELL_MIN = 130
const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    minWidth: CELL_MIN,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  cellHead: { paddingVertical: spacing.xs, alignItems: 'center' },
  cellCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  cellDone:    { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.6 },
  cellFuture:  { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: 0.5 },
  cellLabelCurrent: { ...typography.small, color: colors.textInverse, fontWeight: '700', textAlign: 'center' },
  cellLabelDone:    { ...typography.small, color: colors.textMuted, textDecorationLine: 'line-through', textAlign: 'center' },
  cellLabelFuture:  { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  cellBranch: {
    minWidth: CELL_MIN,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  cellBranchLabel: { ...typography.small, color: colors.warning, fontWeight: '600', textAlign: 'center' },
  subControls: { gap: spacing.xs },
  subBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textInverse,
    alignItems: 'center',
  },
  subBtnDone: { backgroundColor: 'rgba(255,255,255,0.15)' },
  subBtnText: { ...typography.micro, color: colors.textInverse, fontWeight: '600' },
  subInput: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: colors.textInverse,
    ...typography.small,
    textAlign: 'center',
  },
  hhmmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hhmmInput: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: colors.textInverse,
    ...typography.micro,
    textAlign: 'center',
  },
  hhmmSep: { ...typography.micro, color: colors.textInverse, opacity: 0.6 },
  hoursText: { ...typography.small, color: colors.textInverse, fontWeight: '700', textAlign: 'center' },
})
