/**
 * TravelLabourSection — v2.0 mobile capture panel for Start GPS, End GPS,
 * Kilometres, Time Start, Time End, Total Hours.
 *
 * Layout mirrors the four "buttons" the operator asked for in the revised
 * spec:
 *   Start GPS  → button stamps { lat, lng, accuracy_m, at }
 *   End GPS    → button stamps { lat, lng, accuracy_m, at }
 *   Kilometres → auto-calc via Haversine between start_gps + end_gps;
 *                editable — override sets kilometers_manual_override=true
 *   Time Start → button stamps ISO timestamp
 *   Time End   → button stamps ISO timestamp
 *   Total Hrs  → auto-computed from Time Start / End
 *
 * Advisory only — the case state machine does NOT block on these values.
 * State lives inside templateData.travel_labour so the schema validator
 * ignores it during Complete unless the tenant later customises the schema
 * to require it.
 */
import { useMemo } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
} from 'react-native'
import * as Location from 'expo-location'
import { colors, spacing, radii, typography } from '@theme/index'

export interface TravelLabour {
  start_gps?: { lat: number; lng: number; accuracy_m?: number; at?: string } | null
  end_gps?:   { lat: number; lng: number; accuracy_m?: number; at?: string } | null
  kilometers_travelled?: number | null
  kilometers_manual_override?: boolean
  time_start?: string | null
  time_end?:   string | null
  total_hours?: number | null
}

interface Props {
  value: TravelLabour
  onChange: (next: TravelLabour) => void
  disabled?: boolean
}

// Haversine great-circle distance in kilometres.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
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

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Parse an "HH:mm" (or "H:m") string into an ISO timestamp anchored
 * to today's date. Returns null on unparseable input so the FA can
 * clear the field.
 */
function parseHHmmToISO(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!m) return null
  const h = Math.min(23, parseInt(m[1], 10))
  const min = Math.min(59, parseInt(m[2], 10))
  const d = new Date()
  d.setHours(h, min, 0, 0)
  return d.toISOString()
}
function fmtHHmm(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TravelLabourSection({ value, onChange, disabled }: Props) {
  // Auto-recompute km + hours when the inputs change, unless the user
  // has manually overridden the km field.
  const derived = useMemo(() => {
    const next: TravelLabour = { ...value }
    if (value.start_gps && value.end_gps && !value.kilometers_manual_override) {
      next.kilometers_travelled = Math.round(haversineKm(value.start_gps, value.end_gps) * 10) / 10
    }
    if (value.time_start && value.time_end) {
      const ms = new Date(value.time_end).getTime() - new Date(value.time_start).getTime()
      if (ms > 0) next.total_hours = Math.round((ms / 3600000) * 100) / 100
    }
    return next
  }, [value])

  // Whenever the derived values differ from what's in state, push the
  // update up. Guarded to avoid setState loops.
  const drift =
    derived.kilometers_travelled !== value.kilometers_travelled ||
    derived.total_hours          !== value.total_hours
  if (drift) {
    // Defer so we don't setState during render.
    setTimeout(() => onChange(derived), 0)
  }

  const stampStart = async () => {
    const g = await captureGps()
    if (g) onChange({ ...value, start_gps: g, time_start: value.time_start ?? g.at })
  }
  const stampEnd = async () => {
    const g = await captureGps()
    if (g) onChange({ ...value, end_gps: g, time_end: value.time_end ?? g.at })
  }
  const stampTimeStart = () => onChange({ ...value, time_start: new Date().toISOString() })
  const stampTimeEnd   = () => onChange({ ...value, time_end:   new Date().toISOString() })

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={() => void stampStart()}
          disabled={disabled}
        >
          <Text style={styles.btnText}>{value.start_gps ? '✓ Start GPS' : 'Start GPS'}</Text>
          {value.start_gps?.at && <Text style={styles.btnHint}>{fmtTime(value.start_gps.at)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={() => void stampEnd()}
          disabled={disabled}
        >
          <Text style={styles.btnText}>{value.end_gps ? '✓ End GPS' : 'End GPS'}</Text>
          {value.end_gps?.at && <Text style={styles.btnHint}>{fmtTime(value.end_gps.at)}</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Kilometres travelled</Text>
        <TextInput
          style={styles.input}
          value={value.kilometers_travelled != null ? String(value.kilometers_travelled) : ''}
          onChangeText={txt => {
            if (txt.trim() === '') {
              onChange({ ...value, kilometers_travelled: null, kilometers_manual_override: false })
              return
            }
            const n = parseFloat(txt)
            onChange({
              ...value,
              kilometers_travelled: Number.isNaN(n) ? null : n,
              kilometers_manual_override: true,
            })
          }}
          keyboardType="numeric"
          editable={!disabled}
          placeholder={value.start_gps && value.end_gps ? 'auto from GPS' : '—'}
          placeholderTextColor={colors.textSubtle}
        />
        {value.kilometers_manual_override && (
          <Text style={styles.hint}>manual override</Text>
        )}
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={stampTimeStart}
          disabled={disabled}
        >
          <Text style={styles.btnText}>{value.time_start ? '✓ Time Start' : 'Time Start'}</Text>
          {value.time_start && <Text style={styles.btnHint}>{fmtTime(value.time_start)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={stampTimeEnd}
          disabled={disabled}
        >
          <Text style={styles.btnText}>{value.time_end ? '✓ Time End' : 'Time End'}</Text>
          {value.time_end && <Text style={styles.btnHint}>{fmtTime(value.time_end)}</Text>}
        </TouchableOpacity>
      </View>

      {/* Sprint Q2 — manual time override. If the FA forgot to tap the
         Start/End buttons on-site, they can type the actual times here
         (HH:mm, anchored to today). Total hours recomputes automatically. */}
      <View style={styles.row}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>Start (HH:mm)</Text>
          <TextInput
            style={styles.input}
            value={fmtHHmm(value.time_start)}
            onChangeText={txt => onChange({ ...value, time_start: parseHHmmToISO(txt) })}
            keyboardType="numbers-and-punctuation"
            editable={!disabled}
            placeholder="08:15"
            placeholderTextColor={colors.textSubtle}
            maxLength={5}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>End (HH:mm)</Text>
          <TextInput
            style={styles.input}
            value={fmtHHmm(value.time_end)}
            onChangeText={txt => onChange({ ...value, time_end: parseHHmmToISO(txt) })}
            keyboardType="numbers-and-punctuation"
            editable={!disabled}
            placeholder="16:30"
            placeholderTextColor={colors.textSubtle}
            maxLength={5}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Total hours</Text>
        <Text style={styles.total}>
          {value.total_hours != null ? `${value.total_hours.toFixed(2)} h` : '—'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { ...typography.small, color: colors.primary, fontWeight: '600' },
  btnHint: { ...typography.micro, color: colors.textSubtle, marginTop: 2 },
  field: { gap: 4 },
  label: { ...typography.small, color: colors.textMuted },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },
  hint: { ...typography.micro, color: colors.warning, fontStyle: 'italic' },
  total: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '600',
  },
})
