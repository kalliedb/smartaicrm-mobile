/**
 * Case templates — /fs/case-templates returns the 6 seeded MOBILE
 * schemas (onsite_support, install_deinstall, service_call,
 * product_delivery, asset_count, general) with their full JSON Schema
 * Draft-07 payload attached.
 *
 * The FA only needs one at a time — whichever the dispatcher picked
 * on the ticket → case conversion. But listing them all up front means
 * the mobile app can show a picker if the FA has to reclassify
 * mid-work (e.g. an "install" that turns out to be a "service call").
 */
import client, { type ApiEnvelope } from './client'

export interface CaseTemplate {
  id: string
  tenantId: string
  code: string
  name: string
  isActive: boolean
  templateVersion: string
  jsonSchema: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export const templatesApi = {
  list: async (): Promise<CaseTemplate[]> => {
    const r = (await client.get('/fs/case-templates')).data as ApiEnvelope<CaseTemplate[]>
    if (!r.success) throw new Error(r.error?.message ?? 'Failed to load templates')
    return r.data ?? []
  },

  get: async (id: string): Promise<CaseTemplate> => {
    const r = (await client.get(`/fs/case-templates/${id}`)).data as ApiEnvelope<CaseTemplate>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Template not found')
    return r.data
  },
}
