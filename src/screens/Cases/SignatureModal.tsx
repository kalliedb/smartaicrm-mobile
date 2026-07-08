/**
 * SignatureModal — captures a customer signature on a full-screen canvas
 * (WebView-backed via react-native-signature-canvas), uploads the PNG
 * to /documents/upload, and hands the resulting fileUrl back to the
 * caller so it can be patched onto the case.
 *
 * Kept as its own modal so the WebView is torn down when we're done —
 * leaving it mounted inside CaseDetailScreen leaked WebView memory on
 * a device with many cases.
 */
import { useRef, useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import Signature from 'react-native-signature-canvas'
import { uploadDocument } from '@api/documents'
import { colors, spacing, radii, typography } from '@theme/index'

interface Props {
  visible: boolean
  caseId: string
  onClose: () => void
  onCaptured: (fileUrl: string) => void
}

// White canvas + primary-teal stroke; matches the FA-facing tone.
const CANVAS_STYLE = `
  .m-signature-pad--footer { display: none; margin: 0; }
  body,html { background-color: #FFFFFF; height: 100%; }
`

export default function SignatureModal({ visible, caseId, onClose, onCaptured }: Props) {
  // Signature canvas exposes readSignature() + clearSignature() imperatively;
  // its library types don't expose a proper ref type, so we type as any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOK = async (dataUrl: string) => {
    // dataUrl looks like "data:image/png;base64,iVBORw0K…". Uploader
    // will materialise the data URI into a real cache-dir file before
    // uploading — RN FormData can't stream data URIs directly.
    setError(null)
    setUploading(true)
    try {
      const doc = await uploadDocument({
        uri: dataUrl,
        name: `signature-${caseId}-${Date.now()}.png`,
        mimeType: 'image/png',
        entityType: 'fs_work_order',
        entityId: caseId,
        module: 'field_services',
      })
      onCaptured(doc.fileUrl)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = () => {
    ref.current?.readSignature()
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Customer signature</Text>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.canvasWrap}>
          <Signature
            ref={ref}
            onOK={handleOK}
            onEmpty={() => setError('Signature is empty — please try again')}
            webStyle={CANVAS_STYLE}
            imageType="image/png"
            trimWhitespace
            backgroundColor="#FFFFFF"
            penColor={colors.primary}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => ref.current?.clearSignature()}
            style={[styles.btn, styles.btnGhost]}
            disabled={uploading}
          >
            <Text style={styles.btnGhostText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.btn, styles.btnPrimary, uploading && styles.btnBusy]}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.btnPrimaryText}>Save signature</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  headerBtn: { padding: spacing.sm },
  cancel: { ...typography.body, color: colors.textMuted },
  canvasWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  error: {
    ...typography.small,
    color: colors.danger,
    padding: spacing.md,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnGhostText: { ...typography.bodyB, color: colors.text },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...typography.bodyB, color: colors.textInverse },
  btnBusy: { opacity: 0.7 },
})
