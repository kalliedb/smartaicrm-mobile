/**
 * WorkflowStrip — horizontal step-strip for the FA's case workflow.
 *
 * Each cell is an ACTION (not a status). Tapping the current cell
 * fires its action (advance status and/or capture GPS/time), that
 * cell moves to "done", and the next cell becomes current.
 *
 * Cell ordering + actions:
 *   0  Assigned    — indicator (always done once case exists)
 *   1  Acknowledge — fires assigned → en_route
 *   2  En Route    — fires en_route → on_site;  owns Start GPS
 *   3  On Site     — fires on_site → in_progress; owns End GPS + km
 *   4  Start Work  — captures Time Start (no status change)
 *   5  End Work    — fires in_progress → completed; captures Time End;
 *                    owns Start/End HH:mm override + Total Hours
 *   6  Complete    — fires completed → closed
 *
 * Side branches (Awaiting Parts, Pending Customer) are small amber
 * pills after End Work; tappable only while status = in_progress.
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

// ── The 7 linear cells (indices 0-6) ─────────────────────────────────
// currentCellIdx() returns which cell the FA should act on now, based
// on server status + captured time_start / time_end. Cells with index
// less than current are "done"; cells with greater index are "future".
function currentCellIdx(status: ServiceCaseStatus, tl: TravelLabour): number {
  switch (status) {
    case 'logged':
    case 'assigned':       return 1
    case 'en_route':       return 2
    case 'on_site':        return 3
    case 'in_progress':    return tl.time_start ? 5 : 4
    case 'awaiting_parts': return 4
    case 'on_hold':        return 4
    case 'completed':      return 6
    case 'closed':         return -1   // all done
    case 'cancelled':      return -1
    default:               return -1
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

  const current = currentCellIdx(status, travelLabour)

  const stampStart = async () => {
    const g = await captureGps()
    if (g) onTravelLabourChange({ ...travelLabour, start_gps: g })
  }
  const stampEnd = async () => {
    const g = await captureGps()
    if (g) onTravelLabourChange({ ...travelLabour, end_gps: g })
  }
  const stampTimeStart = () => onTravelLabourChange({ ...travelLabour, time_start: new Date().toISOString() })
  const stampTimeEnd = () => onTravelLabourChange({ ...travelLabour, time_end: new Date().toISOString() })

  // Cell handlers — invoked when the cell IS current + FA taps.
  const cellActions: Record<number, () => void> = {
    0: () => { /* Assigned is passive */ },
    1: () => onAdvance('en_route'),
    2: () => onAdvance('on_site'),
    3: () => onAdvance('in_progress'),
    4: stampTimeStart,
    5: () => { stampTimeEnd(); onAdvance('completed') },
    6: () => onAdvance('closed'),
  }

  // Labels for cell content.
  const cells: Array<{ label: string; kind?: 'primary' | 'passive' }> = [
    { label: 'Assigned',    kind: 'passive' },
    { label: 'Acknowledge', kind: 'primary' },
    { label: 'En Route',    kind: 'primary' },
    { label: 'On Site',     kind: 'primary' },
    { label: 'Start Work',  kind: 'primary' },
    { label: 'End Work',    kind: 'primary' },
    { label: 'Complete',    kind: 'primary' },
  ]

  // Sprint X — Awaiting Parts + Pending Customer are any-time detours;
  // FA can flip a case into either from any live state (assigned →
  // completed). Only truly terminal states hide the branches.
  const LIVE_STATES: ServiceCaseStatus[] = [
    'logged', 'assigned', 'en_route', 'on_site',
    'in_progress', 'awaiting_parts', 'on_hold',
  ]
  const canTapBranch = LIVE_STATES.includes(status)

  const renderCell = (idx: number) => {
    const c = cells[idx]
    const state: 'done' | 'current' | 'future' =
      current === -1 || idx < current ? 'done'
      : idx === current ? 'current'
      : 'future'
    const clickable = state === 'current' && !disabled && c.kind !== 'passive'

    // Which transition is being fired right now? Used to show a spinner
    // in the correct cell during status transitions.
    const busyMap: Record<number, ServiceCaseStatus> = {
      1: 'en_route', 2: 'on_site', 3: 'in_progress', 5: 'completed', 6: 'closed',
    }
    const isBusy = busyMap[idx] === transitioning

    return (
      <View key={idx} style={[styles.cell, cellStyle(state)]}>
        <TouchableOpacity
          activeOpacity={clickable ? 0.7 : 1}
          onPress={clickable ? cellActions[idx] : undefined}
          disabled={!clickable}
          style={styles.cellHead}
        >
          {isBusy ? (
            <ActivityIndicator color={state === 'current' ? colors.textInverse : colors.primary} size="small" />
          ) : (
            <Text style={cellLabelStyle(state)} numberOfLines={1}>
              {state === 'done' ? '✓ ' : ''}{c.label}
            </Text>
          )}
        </TouchableOpacity>

        {/* Ancillary controls per cell — always visible so the FA can
           capture GPS / km / time even after the status has moved on. */}
        {idx === 2 && (
          <TouchableOpacity
            style={[styles.subBtn, travelLabour.start_gps && styles.subBtnDone]}
            onPress={() => void stampStart()} disabled={disabled}
          >
            <Text style={subBtnLabel(state)}>{travelLabour.start_gps ? '✓ Start GPS' : 'Start GPS'}</Text>
          </TouchableOpacity>
        )}
        {idx === 3 && (
          <>
            <TouchableOpacity
              style={[styles.subBtn, travelLabour.end_gps && styles.subBtnDone]}
              onPress={() => void stampEnd()} disabled={disabled}
            >
              <Text style={subBtnLabel(state)}>{travelLabour.end_gps ? '✓ End GPS' : 'End GPS'}</Text>
            </TouchableOpacity>
            <TextInput
              style={subInputStyle(state)}
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
              keyboardType="numeric" editable={!disabled}
            />
          </>
        )}
        {idx === 4 && travelLabour.time_start && (
          <Text style={subCaption(state)}>{fmtHHmm(travelLabour.time_start)}</Text>
        )}
        {idx === 5 && (
          <>
            {travelLabour.time_end && <Text style={subCaption(state)}>{fmtHHmm(travelLabour.time_end)}</Text>}
            <View style={styles.hhmmRow}>
              <TextInput
                style={hhmmInput(state)}
                value={fmtHHmm(travelLabour.time_start)}
                onChangeText={txt => onTravelLabourChange({ ...travelLabour, time_start: parseHHmmToISO(txt) })}
                placeholder="08:15" placeholderTextColor={colors.textSubtle}
                keyboardType="numbers-and-punctuation" maxLength={5} editable={!disabled}
              />
              <Text style={subCaption(state)}>/</Text>
              <TextInput
                style={hhmmInput(state)}
                value={fmtHHmm(travelLabour.time_end)}
                onChangeText={txt => onTravelLabourChange({ ...travelLabour, time_end: parseHHmmToISO(txt) })}
                placeholder="16:30" placeholderTextColor={colors.textSubtle}
                keyboardType="numbers-and-punctuation" maxLength={5} editable={!disabled}
              />
            </View>
            {travelLabour.total_hours != null && (
              <Text style={subCaption(state)}>{travelLabour.total_hours.toFixed(2)} h</Text>
            )}
          </>
        )}
      </View>
    )
  }

  const renderBranch = (label: string, target: ServiceCaseStatus) => {
    const isDone = (target === 'awaiting_parts' && status === 'awaiting_parts')
                || (target === 'on_hold' && status === 'on_hold')
    const clickable = canTapBranch && !isDone && !disabled
    return (
      <TouchableOpacity
        key={target}
        style={[styles.branchPill, isDone && styles.branchPillDone]}
        onPress={clickable ? () => onAdvance(target) : undefined}
        disabled={!clickable}
      >
        {transitioning === target ? (
          <ActivityIndicator size="small" color={colors.warning} />
        ) : (
          <Text style={styles.branchPillText}>{isDone ? '✓ ' : ''}{label}</Text>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {cells.map((_, i) => renderCell(i))}
      </ScrollView>
      <View style={styles.branchRow}>
        {renderBranch('Awaiting Parts', 'awaiting_parts')}
        {renderBranch('Pending Customer', 'on_hold')}
      </View>
    </View>
  )
}

// ── Style helpers ────────────────────────────────────────────────────
function cellStyle(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.cellCurrent
       : state === 'done'    ? styles.cellDone
       : styles.cellFuture
}
function cellLabelStyle(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.labelCurrent
       : state === 'done'    ? styles.labelDone
       : styles.labelFuture
}
function subBtnLabel(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.subBtnTextCurrent : styles.subBtnText
}
function subInputStyle(state: 'done' | 'current' | 'future') {
  return state === 'current' ? [styles.subInput, styles.subInputCurrent] : styles.subInput
}
function hhmmInput(state: 'done' | 'current' | 'future') {
  return state === 'current' ? [styles.hhmmInputBase, styles.hhmmInputCurrent] : styles.hhmmInputBase
}
function subCaption(state: 'done' | 'current' | 'future') {
  return state === 'current' ? styles.subCaptionCurrent : styles.subCaption
}

const CELL_MIN = 92
const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    minWidth: CELL_MIN,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: 4,
    justifyContent: 'flex-start',
  },
  cellHead: { paddingVertical: 4, alignItems: 'center' },
  cellCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  cellDone:    { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.55 },
  cellFuture:  { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: 0.45 },
  labelCurrent: { ...typography.micro, color: colors.textInverse, fontWeight: '700', textAlign: 'center' },
  labelDone:    { ...typography.micro, color: colors.textMuted, textDecorationLine: 'line-through', textAlign: 'center' },
  labelFuture:  { ...typography.micro, color: colors.textMuted, textAlign: 'center' },
  subBtn: {
    paddingVertical: 4, paddingHorizontal: 6,
    borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  subBtnDone: { backgroundColor: 'rgba(255,255,255,0.15)' },
  subBtnText:        { ...typography.micro, color: colors.textMuted, fontSize: 10 },
  subBtnTextCurrent: { ...typography.micro, color: colors.textInverse, fontWeight: '600', fontSize: 10 },
  subInput: {
    paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: radii.sm, backgroundColor: 'rgba(0,0,0,0.05)',
    color: colors.text, textAlign: 'center', fontSize: 11,
  },
  subInputCurrent: { backgroundColor: 'rgba(255,255,255,0.15)', color: colors.textInverse },
  hhmmRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  hhmmInputBase: {
    flex: 1, paddingHorizontal: 4, paddingVertical: 2,
    borderRadius: radii.sm, backgroundColor: 'rgba(0,0,0,0.05)',
    color: colors.text, textAlign: 'center', fontSize: 10,
  },
  hhmmInputCurrent: { backgroundColor: 'rgba(255,255,255,0.15)', color: colors.textInverse },
  subCaption:        { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  subCaptionCurrent: { fontSize: 10, color: colors.textInverse, opacity: 0.8, textAlign: 'center', fontWeight: '600' },
  branchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'flex-end',
  },
  branchPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.warning,
    backgroundColor: 'transparent',
  },
  branchPillDone: { backgroundColor: 'rgba(255,193,7,0.15)' },
  branchPillText: { ...typography.micro, color: colors.warning, fontWeight: '600' },
})
