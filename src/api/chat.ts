/**
 * Chat REST endpoints — used both as the sole source of truth on poll
 * fallback AND to hydrate initial state before the WebSocket takes over.
 *
 * The wire shape here matches server/src/routes/fs-chat.ts on the desktop
 * portal. Anything we don't render on mobile yet (reactions, pins,
 * mentions) still round-trips through the message object; we just
 * ignore those fields in the FA UI.
 */
import client, { type ApiEnvelope } from './client'

export interface ChatMessage {
  id: string
  conversationId: string
  authorUserId: string | null
  authorName: string | null
  body: string
  attachments: unknown[]
  mentions: unknown[]
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  pinnedAt: string | null
  pinnedByUserId: string | null
  reactions: Array<{ emoji: string; userId: string }>
}

export interface ChatConversationSummary {
  id: string
  kind: 'job' | 'direct' | 'team'
  title: string | null
  workOrderId: string | null
  lastMessageAt: string | null
  unreadCount: number
}

export const chatApi = {
  /**
   * All conversations the caller is a participant in — job (case),
   * direct, and team. Sorted newest activity first by the server.
   * Backs the FA's chat inbox on mobile.
   */
  conversations: async (): Promise<ChatConversationSummary[]> => {
    const r = (await client.get('/chat/conversations')).data as ApiEnvelope<ChatConversationSummary[]>
    if (!r.success) throw new Error(r.error?.message ?? 'Failed to load conversations')
    return r.data ?? []
  },

  /**
   * Ensure (idempotent) the job conversation for a case exists and return
   * its id. The server also lazy-creates it on first case save, so this
   * is a belt-and-braces call when the FA opens chat for a case that
   * predates the auto-create hook.
   */
  forCase: async (caseId: string): Promise<string> => {
    const r = (await client.post(`/chat/conversations/for-case/${caseId}`)).data as ApiEnvelope<{ conversationId: string }>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Could not resolve case conversation')
    return r.data.conversationId
  },

  /**
   * List messages in a conversation. `since` (ISO) returns only messages
   * strictly newer than that timestamp — used by the polling fallback to
   * avoid re-fetching everything on every tick.
   */
  messages: async (conversationId: string, since?: string): Promise<ChatMessage[]> => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : ''
    const r = (await client.get(`/chat/conversations/${conversationId}/messages${qs}`)).data as ApiEnvelope<ChatMessage[]>
    if (!r.success) throw new Error(r.error?.message ?? 'Failed to load messages')
    return r.data ?? []
  },

  send: async (conversationId: string, body: string): Promise<ChatMessage> => {
    const r = (await client.post(`/chat/conversations/${conversationId}/messages`, { body })).data as ApiEnvelope<ChatMessage>
    if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Send failed')
    return r.data
  },

  markRead: async (conversationId: string): Promise<void> => {
    // Fire-and-forget — we don't care about the response body, only that
    // the server updates last_read_at so the badge on desktop clears.
    try { await client.post(`/chat/conversations/${conversationId}/read`) } catch { /* ignore */ }
  },
}
