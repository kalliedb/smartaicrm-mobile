/**
 * TemplateForm — mobile schema-driven form.
 *
 * Reads a template's JSON Schema Draft-07 and renders the FA-facing
 * form. Supports the field kinds actually used by the six seeded case
 * templates (see server/src/db/case-schemas.ts):
 *
 *   - string           → single-line text
 *   - string (long)    → textarea (maxLength ≥ 500)
 *   - string (enum)    → picker
 *   - number/integer   → numeric text input
 *   - boolean          → switch
 *   - array + string enum → multi-select chips
 *
 * Not rendered on mobile (uploaded via other flows, or web-only):
 *   - format: uri (photo URL arrays)          → note redirecting to Photos section
 *   - object (gps_coordinates, parts_used)    → note; captured automatically or web
 *   - allOf / if-then conditional required    → server enforces at complete
 *
 * Local validation on submit checks required + basic type/enum/minLength.
 * The server's ajv is authoritative — mobile just catches obvious errors
 * before firing the network call.
 */
import { useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet,
} from 'react-native'
import { colors, spacing, radii, typography } from '@theme/index'

// Prettify a snake_case field name for the FA. "issue_category" → "Issue category".
function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

interface FieldSchema {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  format?: string
  items?: FieldSchema
  properties?: Record<string, FieldSchema>
  required?: string[]
  description?: string
}

interface Props {
  /** The full envelope schema — we read jsonSchema.properties.form_data */
  jsonSchema: Record<string, unknown>
  /** Current form data (the inner form_data bag, not the envelope) */
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
}

interface FormDataSchema {
  properties: Record<string, FieldSchema>
  required?: string[]
}

function readFormDataSchema(envelope: Record<string, unknown>): FormDataSchema | null {
  const props = (envelope.properties as Record<string, unknown> | undefined)
  if (!props) return null
  const formData = props.form_data as FieldSchema | undefined
  if (!formData || !formData.properties) return null
  return {
    properties: formData.properties,
    required: formData.required,
  }
}

/** Best-effort local validation. Server ajv is authoritative. */
export function validateFormData(
  envelope: Record<string, unknown>,
  formData: Record<string, unknown>,
): string[] {
  const schema = readFormDataSchema(envelope)
  if (!schema) return []
  const errors: string[] = []

  for (const req of schema.required ?? []) {
    const v = formData[req]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      errors.push(`${humanise(req)} is required`)
    }
  }

  for (const [key, field] of Object.entries(schema.properties)) {
    const v = formData[key]
    if (v === undefined || v === null || v === '') continue
    if (field.enum && !field.enum.includes(v)) {
      errors.push(`${humanise(key)} must be one of ${field.enum.join(', ')}`)
    }
    if (typeof v === 'string' && field.minLength !== undefined && v.length < field.minLength) {
      errors.push(`${humanise(key)} must be at least ${field.minLength} characters`)
    }
  }

  return errors
}

export default function TemplateForm({ jsonSchema, value, onChange, disabled }: Props) {
  const schema = useMemo(() => readFormDataSchema(jsonSchema), [jsonSchema])

  if (!schema) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Template has no form fields.</Text>
      </View>
    )
  }

  const setField = (key: string, next: unknown) => {
    if (disabled) return
    onChange({ ...value, [key]: next })
  }

  return (
    <View style={styles.wrap}>
      {Object.entries(schema.properties).map(([key, field]) => (
        <Field
          key={key}
          fieldKey={key}
          field={field}
          value={value[key]}
          required={(schema.required ?? []).includes(key)}
          onChange={next => setField(key, next)}
          disabled={disabled}
        />
      ))}
    </View>
  )
}

function Field({ fieldKey, field, value, required, onChange, disabled }: {
  fieldKey: string
  field: FieldSchema
  value: unknown
  required: boolean
  onChange: (next: unknown) => void
  disabled?: boolean
}) {
  const label = humanise(fieldKey)
  const labelNode = (
    <Text style={styles.label}>
      {label}{required && <Text style={styles.required}> *</Text>}
    </Text>
  )

  // ─── Photo array (format: uri) — redirect to Photos section ──────
  if (field.type === 'array' && field.items?.format === 'uri') {
    return (
      <View style={styles.row}>
        {labelNode}
        <Text style={styles.hint}>Attach photos in the Photos section above.</Text>
      </View>
    )
  }

  // ─── Nested object (gps_coordinates etc.) — captured elsewhere ──
  if (field.type === 'object') {
    return (
      <View style={styles.row}>
        {labelNode}
        <Text style={styles.hint}>Captured automatically (on-site GPS or web).</Text>
      </View>
    )
  }

  // ─── String enum → picker ────────────────────────────────────────
  if (field.enum && (field.type === 'string' || field.type === undefined)) {
    return (
      <View style={styles.row}>
        {labelNode}
        <View style={styles.chipRow}>
          {(field.enum as string[]).map(opt => {
            const selected = value === opt
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange(selected ? null : opt)}
                disabled={disabled}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  // ─── Array of objects → repeatable rows (case_line_items etc.) ──
  // Renders sku / description / qty / serial_number rows with add / delete.
  // Barcode scan is stubbed for v2.0 — real scanner arrives in the next
  // native build (needs expo-camera + iOS/Android permissions).
  if (field.type === 'array' && field.items?.type === 'object') {
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
    const itemProps = field.items.properties ?? {}
    const itemPropKeys = Object.keys(itemProps)
    const rowLabel = itemPropKeys.length > 0 ? 'Row' : 'Entry'
    const addRow = () => onChange([...rows, {}])
    const setField = (rowIdx: number, key: string, next: unknown) => {
      const nextRows = rows.map((r, i) => i === rowIdx ? { ...r, [key]: next } : r)
      onChange(nextRows)
    }
    const removeRow = (rowIdx: number) => {
      onChange(rows.filter((_, i) => i !== rowIdx))
    }
    return (
      <View style={styles.row}>
        {labelNode}
        {rows.map((r, idx) => (
          <View key={idx} style={styles.lineItemCard}>
            <View style={styles.lineItemHeader}>
              <Text style={styles.lineItemTitle}>{rowLabel} {idx + 1}</Text>
              {!disabled && (
                <TouchableOpacity onPress={() => removeRow(idx)}>
                  <Text style={styles.lineItemRemove}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            {itemPropKeys.map(key => {
              const propSchema = itemProps[key]
              const propType = propSchema.type
              const propVal = r[key]
              const displayLabel = humanise(key)
              const kbd: 'numeric' | 'default' =
                propType === 'integer' || propType === 'number' ? 'numeric' : 'default'
              return (
                <View key={key} style={styles.lineItemField}>
                  <Text style={styles.lineItemFieldLabel}>{displayLabel}</Text>
                  <View style={styles.lineItemInputRow}>
                    <TextInput
                      style={styles.lineItemInput}
                      value={propVal === undefined || propVal === null ? '' : String(propVal)}
                      onChangeText={txt => {
                        if (kbd === 'numeric') {
                          if (txt.trim() === '') { setField(idx, key, null); return }
                          const n = propType === 'integer' ? parseInt(txt, 10) : parseFloat(txt)
                          setField(idx, key, Number.isNaN(n) ? null : n)
                        } else {
                          setField(idx, key, txt)
                        }
                      }}
                      keyboardType={kbd}
                      maxLength={propSchema.maxLength}
                      editable={!disabled}
                    />
                    {(key === 'sku' || key === 'serial_number') && !disabled && (
                      <TouchableOpacity
                        style={styles.scanBtn}
                        onPress={() => alert('Barcode scan lands in the next mobile build (v2.1). Type the value for now.')}
                      >
                        <Text style={styles.scanBtnText}>Scan</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        ))}
        {!disabled && (
          <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
            <Text style={styles.addRowBtnText}>+ Add {rowLabel.toLowerCase()}</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  // ─── Array of enum strings → multi-select chips ─────────────────
  if (field.type === 'array' && field.items?.enum) {
    const arr = Array.isArray(value) ? (value as string[]) : []
    const toggle = (opt: string) => {
      const next = arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt]
      onChange(next)
    }
    return (
      <View style={styles.row}>
        {labelNode}
        <View style={styles.chipRow}>
          {(field.items.enum as string[]).map(opt => {
            const selected = arr.includes(opt)
            return (
              <TouchableOpacity
                key={opt}
                onPress={() => toggle(opt)}
                disabled={disabled}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  // ─── Boolean → switch ────────────────────────────────────────────
  if (field.type === 'boolean') {
    return (
      <View style={[styles.row, styles.switchRow]}>
        {labelNode}
        <Switch
          value={Boolean(value)}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
        />
      </View>
    )
  }

  // ─── Number / integer → numeric text input ───────────────────────
  if (field.type === 'number' || field.type === 'integer') {
    return (
      <View style={styles.row}>
        {labelNode}
        <TextInput
          style={styles.input}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChangeText={txt => {
            if (txt.trim() === '') { onChange(null); return }
            const n = field.type === 'integer' ? parseInt(txt, 10) : parseFloat(txt)
            onChange(Number.isNaN(n) ? null : n)
          }}
          keyboardType="numeric"
          editable={!disabled}
        />
      </View>
    )
  }

  // ─── Long string → multiline textarea ────────────────────────────
  if (field.type === 'string' && (field.maxLength ?? 0) >= 500) {
    return (
      <View style={styles.row}>
        {labelNode}
        <TextInput
          style={[styles.input, styles.textarea]}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline
          maxLength={field.maxLength}
          editable={!disabled}
          placeholder={field.description}
          placeholderTextColor={colors.textSubtle}
        />
      </View>
    )
  }

  // ─── Default: single-line text ───────────────────────────────────
  return (
    <View style={styles.row}>
      {labelNode}
      <TextInput
        style={styles.input}
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        maxLength={field.maxLength}
        editable={!disabled}
        placeholder={field.description}
        placeholderTextColor={colors.textSubtle}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { gap: spacing.xs },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.small, color: colors.textMuted },
  required: { color: colors.danger },
  hint: { ...typography.small, color: colors.textSubtle, fontStyle: 'italic' },
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
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.small, color: colors.text },
  chipTextSelected: { color: colors.textInverse, fontWeight: '600' },
  notice: { padding: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radii.md },
  noticeText: { ...typography.small, color: colors.textMuted },
  lineItemCard: {
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lineItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineItemTitle: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  lineItemRemove: { ...typography.small, color: colors.danger },
  lineItemField: { gap: 4 },
  lineItemFieldLabel: { ...typography.micro, color: colors.textSubtle },
  lineItemInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineItemInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },
  scanBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
  },
  scanBtnText: { ...typography.small, color: colors.textInverse, fontWeight: '600' },
  addRowBtn: {
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  addRowBtnText: { ...typography.small, color: colors.primary, fontWeight: '600' },
})
