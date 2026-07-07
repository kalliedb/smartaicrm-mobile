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
  siteAddress: string | null
  siteLat: string | null
  siteLng: string | null
  serviceType: string
  priority: string
  status: ServiceCaseStatus
  assignedUserId: string | null
  classificationTemplateId: string | null
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

// Transition map matches server/src/services/fs-state-machine.ts. Duplicated
// on the client so we can hide impossible actions before the server rejects.
const FORWARD: Record<ServiceCaseStatus, ServiceCaseStatus[]> = {
  logged:         ['classified', 'assigned'],
  classified:     ['assigned'],
  assigned:       ['dispatched', 'en_route'],
  dispatched:     ['en_route'],
  en_route:       ['on_site'],
  on_site:        ['in_progress'],
  in_progress:    ['awaiting_parts', 'completed'],
  awaiting_parts: ['in_progress'],
  completed:      ['invoiced'],
  invoiced:       ['paid'],
  paid:           ['closed'],
  closed:         [],
  cancelled:      [],
  on_hold:        ['in_progress'],
  no_show:        [],
  escalated:      [],
  reassigned:     [],
  new:            ['classified', 'assigned'],
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
}
