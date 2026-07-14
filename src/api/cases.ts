/**
 * Field Services cases API — mirrors the /fs/cases surface of the desktop
 * portal. Field agents see only cases assigned to them (server-scoped).
 *
 * Endpoints used:
 *   GET  /fs/cases            → list (FA-scoped by role)
 *   GET  /fs/cases/:id        → one case with full detail
 *   PATCH /fs/cases/:id/status → drive the state machine
 */
import client, { type ApiEnvelope } from './client'

export type ServiceCaseStatus =
  | 'logged' | 'classified' | 'assigned' | 'dispatched'
  | 'en_route' | 'on_site' | 'in_progress' | 'awaiting_parts'
  | 'completed' | 'invoiced' | 'paid' | 'closed'
  | 'cancelled' | 'on_hold' | 'no_show' | 'escalated' | 'reassigned'
  | 'new' | 'scheduled'

export interface ServiceCase {
  id: string
  tenantId: string
  workOrderNumber: string
  serviceRequestId: string | null
  customerCompanyId: string | null
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  // Sprint O — the individual at the customer (not the company).
  contactPerson: string | null
  siteAddress: string | null
  siteLat: string | null
  siteLng: string | null
  serviceType: string
  priority: string
  status: ServiceCaseStatus
  assignedUserId: string | null
  // Joined from GET /fs/cases so the FA sees the dispatcher-assigned
  // agent's name on the General row (Sprint T).
  assignedUserName?: string | null
  assignedUserEmail?: string | null
  classificationTemplateId: string | null
  templateData: Record<string, unknown> | null
  description: string | null
  workNotes: string | null
  customerSignatureUrl: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  enRouteAt: string | null
  onSiteAt: string | null
  createdAt: string
  updatedAt: string
}

// Sprint S — mirrors server/src/services/fs-state-machine.ts. Retired
// states keep a legal single-hop forward path for back-compat rendering
// of historic cases; they don't appear in day-to-day mobile flow.
const FORWARD: Record<ServiceCaseStatus, ServiceCaseStatus[]> = {
  logged:         ['assigned'],
  assigned:       ['en_route'],                     // Acknowledge
  en_route:       ['on_site'],
  on_site:        ['in_progress'],                  // Start Work
  in_progress:    ['awaiting_parts', 'on_hold', 'completed'],
  awaiting_parts: ['in_progress'],
  on_hold:        ['in_progress', 'cancelled'],     // Pending Customer
  completed:      ['closed'],
  closed:         [],
  cancelled:      [],
  // Retired — back-compat rendering only
  classified:     ['assigned'],
  dispatched:     ['en_route'],
  invoiced:       ['closed'],
  paid:           ['closed'],
  no_show:        [],
  escalated:      [],
  reassigned:     [],
  new:            ['assigned'],
  scheduled:      ['en_route'],
}

export function allowedNextStatuses(current: ServiceCaseStatus): ServiceCaseStatus[] {
  return FORWARD[current] ?? []
}

export const casesApi = {
  list: async (): Promise<ServiceCase[]> => {
    const r = (await client.get('/fs/cases')).data as ApiEnvelope<ServiceCase[]>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Failed to load cases')
    return r.data
  },

  get: async (id: string): Promise<ServiceCase> => {
    const r = (await client.get(`/fs/cases/${id}`)).data as ApiEnvelope<ServiceCase>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Case not found')
    return r.data
  },

  update: async (id: string, patch: Partial<ServiceCase>): Promise<ServiceCase> => {
    const r = (await client.patch(`/fs/cases/${id}`, patch)).data as ApiEnvelope<ServiceCase>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Update failed')
    return r.data
  },

  transition: async (
    id: string,
    next: ServiceCaseStatus,
    geo?: { lat: number; lng: number },
  ): Promise<ServiceCase> => {
    const r = (await client.patch(`/fs/cases/${id}/status`, {
      status: next,
      ...(geo ?? {}),
    })).data as ApiEnvelope<ServiceCase>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Status change failed')
    return r.data
  },

  /**
   * v2.0 — spawn a follow-up case from this one. Called after the FA
   * completes a case with case_outcome_status="Follow-up". Server clones
   * customer/contact/site/line_items, sets parent_case_id, and moves
   * the parent to Resolved.
   */
  followUp: async (id: string): Promise<ServiceCase> => {
    const r = (await client.post(`/fs/cases/${id}/follow-up`, {})).data as ApiEnvelope<ServiceCase>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Follow-up failed')
    return r.data
  },
}
