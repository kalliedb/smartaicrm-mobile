/**
 * Document upload — the server /documents/upload endpoint accepts a
 * multipart `file` field plus optional entityType/entityId linkage. On
 * mobile we upload photos + signature PNGs and tie them to the case via
 * (entityType='fs_work_order', entityId=<caseId>).
 *
 * We hit the endpoint directly with fetch() rather than axios: axios in
 * RN doesn't stream a File-shaped object cleanly, but fetch does — RN's
 * FormData knows how to serialise { uri, name, type } into a multipart
 * body.
 */
import env from '@config/env'
import { getTokens } from '@utils/storage'

export interface UploadedDocument {
  id: string
  name: string
  type: string
  fileUrl: string
  fileSize: number
  createdAt: string
}

export interface UploadInput {
  uri: string
  name: string
  mimeType: string
  entityType?: string
  entityId?: string
  module?: string
}

export async function uploadDocument(input: UploadInput): Promise<UploadedDocument> {
  const tokens = await getTokens()
  if (!tokens?.accessToken) throw new Error('Not authenticated')

  const form = new FormData()
  // React Native FormData serialisation shape.
  form.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  if (input.entityType) form.append('entityType', input.entityType)
  if (input.entityId) form.append('entityId', input.entityId)
  if (input.module) form.append('module', input.module)

  // Don't set Content-Type — fetch will populate multipart/form-data
  // WITH the boundary. Setting it manually breaks the boundary.
  const res = await fetch(`${env.apiBaseUrl}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    body: form,
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? `Upload failed (${res.status})`)
  }
  return json.data as UploadedDocument
}
