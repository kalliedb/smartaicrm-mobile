/**
 * Document upload — /documents/upload accepts a multipart `file` field
 * plus optional entityType/entityId linkage.
 *
 * Two things we work around here that bit us in FIELD-3 testing:
 *
 *   1. RN FormData can't stream a data: URI. The signature canvas hands
 *      us `data:image/png;base64,…` — if we drop that straight into
 *      FormData the multipart body is malformed and the server 500s.
 *      Solution: materialise data URIs to a temp file first.
 *
 *   2. `res.json()` on a non-JSON response throws a cryptic "JSON parse
 *      error". If Render returns an nginx/5xx HTML page (or a proxy
 *      timeout) we want to see the actual body, not a parse error.
 *      Solution: read as text, try JSON.parse, surface the raw body
 *      on failure.
 */
// Use the legacy API — expo-file-system@19 shipped a new File/Directory
// class API on the default export; cacheDirectory + writeAsStringAsync
// still live on the `/legacy` sub-path and are cheaper for a one-shot
// data-URI → file write.
import * as FileSystem from 'expo-file-system/legacy'
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

/**
 * If `uri` is a data URL, decode the base64 payload to a real file in
 * the cache dir and return the new file URI. Otherwise return the URI
 * unchanged. Cleanup is caller's responsibility — the cache dir gets
 * swept by the OS eventually anyway.
 */
async function materialiseDataUri(uri: string, name: string): Promise<string> {
  if (!uri.startsWith('data:')) return uri
  const commaIdx = uri.indexOf(',')
  if (commaIdx === -1) throw new Error('Malformed data URI')
  const base64 = uri.slice(commaIdx + 1)
  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) throw new Error('No cache directory available')
  const targetPath = `${cacheDir}${Date.now()}-${name}`
  await FileSystem.writeAsStringAsync(targetPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return targetPath
}

export async function uploadDocument(input: UploadInput): Promise<UploadedDocument> {
  const tokens = await getTokens()
  if (!tokens?.accessToken) throw new Error('Not authenticated')

  const localUri = await materialiseDataUri(input.uri, input.name)

  const form = new FormData()
  form.append('file', {
    uri: localUri,
    name: input.name,
    type: input.mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  if (input.entityType) form.append('entityType', input.entityType)
  if (input.entityId) form.append('entityId', input.entityId)
  if (input.module) form.append('module', input.module)

  // Don't set Content-Type — fetch populates multipart/form-data WITH
  // the correct boundary. Setting it manually breaks the boundary.
  let res: Response
  try {
    res = await fetch(`${env.apiBaseUrl}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      body: form,
    })
  } catch (err) {
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Read as text so a non-JSON response (nginx 502 HTML, proxy timeout,
  // etc.) surfaces its actual body instead of throwing a parse error.
  const rawText = await res.text()
  let parsed: { success?: boolean; data?: UploadedDocument; error?: { message?: string } } | null = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    // Server didn't return JSON — surface a snippet of the actual body.
    const snippet = rawText.slice(0, 200).replace(/\s+/g, ' ')
    console.warn(`[uploadDocument] non-JSON response (${res.status}):`, snippet)
    throw new Error(`Upload failed (${res.status}): ${snippet || 'empty response'}`)
  }

  if (!res.ok || !parsed?.success || !parsed?.data) {
    const message = parsed?.error?.message ?? `HTTP ${res.status}`
    console.warn(`[uploadDocument] server rejected:`, message, rawText.slice(0, 400))
    throw new Error(message)
  }

  return parsed.data
}
