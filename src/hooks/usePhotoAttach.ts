/**
 * usePhotoAttach — camera + gallery picker, upload to /documents/upload,
 * accumulate the uploaded documents in local state.
 *
 * The picker asks the OS for camera or media library permission; a
 * decline is not fatal — we just surface an error and leave the caller
 * to render their own placeholder. Uploads run one at a time so we can
 * report progress per file (the endpoint is single-file).
 */
import { useCallback, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { uploadDocument, type UploadedDocument } from '@api/documents'

interface Options {
  caseId: string
  // Sprint X — lets a second usage of this hook (Attachments section)
  // tag uploads with a different entityType so the portal can filter
  // photos vs attachments. Defaults to 'fs_work_order' for back-compat.
  entityType?: string
}

export function usePhotoAttach({ caseId, entityType }: Options) {
  const [uploaded, setUploaded] = useState<UploadedDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    setError(null)
    setUploading(true)
    try {
      const name = asset.fileName
        ?? `case-${caseId}-${Date.now()}.jpg`
      // expo-image-picker returns file:// URIs on both platforms.
      const doc = await uploadDocument({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType ?? 'image/jpeg',
        entityType: entityType ?? 'fs_work_order',
        entityId: caseId,
        module: 'field_services',
      })
      setUploaded(prev => [doc, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [caseId, entityType])

  const pickFromCamera = useCallback(async () => {
    setError(null)
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      setError('Camera permission denied')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,   // ~200 kB per photo, plenty for a case-file thumbnail
      exif: false,
    })
    if (result.canceled || !result.assets[0]) return
    await upload(result.assets[0])
  }, [upload])

  const pickFromLibrary = useCallback(async () => {
    setError(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setError('Gallery permission denied')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    await upload(result.assets[0])
  }, [upload])

  return {
    uploaded,
    uploading,
    error,
    pickFromCamera,
    pickFromLibrary,
    clearError: () => setError(null),
  }
}
