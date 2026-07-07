/**
 * useChatSocket — connect to /ws/chat for realtime messages, fall back
 * to REST polling whenever the socket is missing / closed / errored.
 *
 * Wire protocol (matches server/src/services/fs-chat-ws.service.ts):
 *   → { type: 'subscribe',   conversationIds: [id] }
 *   ← { type: 'new_message', message: ChatMessage }
 *   ← { type: 'message_updated', message: ChatMessage }
 *
 * We deduplicate by message id so a WS-delivered message and its
 * polled duplicate never both render — the last one wins in the map.
 *
 * The polling loop stays cheap: it uses the `since` query so each tick
 * asks for "messages newer than the newest one I already have", which
 * is empty most of the time.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi, type ChatMessage } from '@api/chat'
import { getTokens } from '@utils/storage'
import env from '@config/env'

interface Options {
  conversationId: string | null
  pollMs?: number
}

interface UseChatSocket {
  messages: ChatMessage[]
  connected: boolean
  error: string | null
  send: (body: string) => Promise<void>
  refresh: () => Promise<void>
}

function toWsUrl(apiBase: string): string {
  // apiBase looks like https://api.smartaicrm.co.za/api/v1
  // WS lives at wss://api.smartaicrm.co.za/ws/chat (no /api/v1 prefix).
  const trimmed = apiBase.replace(/\/api\/v1\/?$/, '')
  return trimmed.replace(/^http/, 'ws') + '/ws/chat'
}

export function useChatSocket({ conversationId, pollMs = 4000 }: Options): UseChatSocket {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])

  // Keep a ref in sync so callbacks read the latest without re-subscribing.
  messagesRef.current = messages

  const upsert = useCallback((incoming: ChatMessage | ChatMessage[]) => {
    const list = Array.isArray(incoming) ? incoming : [incoming]
    if (list.length === 0) return
    setMessages(prev => {
      const map = new Map<string, ChatMessage>()
      for (const m of prev) map.set(m.id, m)
      for (const m of list) map.set(m.id, m)
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!conversationId) return
    try {
      const latest = messagesRef.current[messagesRef.current.length - 1]
      const rows = await chatApi.messages(conversationId, latest?.createdAt)
      upsert(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    }
  }, [conversationId, upsert])

  const send = useCallback(async (body: string) => {
    if (!conversationId) throw new Error('No conversation')
    const trimmed = body.trim()
    if (!trimmed) return
    const created = await chatApi.send(conversationId, trimmed)
    // Optimistic upsert — WS broadcast will arrive with the same id and
    // dedupe cleanly, so this doesn't produce a double bubble.
    upsert(created)
  }, [conversationId, upsert])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    let cancelled = false
    let closedByUs = false

    // 1. Initial hydrate — always via REST so we get history even if the
    //    socket takes a second.
    void chatApi.messages(conversationId).then(rows => {
      if (!cancelled) upsert(rows)
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed')
    })

    // 2. Try to open a WebSocket. If it fails or drops, the polling loop
    //    below still fires — the two are complementary, not exclusive.
    void (async () => {
      try {
        const tokens = await getTokens()
        if (!tokens?.accessToken || cancelled) return
        const url = `${toWsUrl(env.apiBaseUrl)}?token=${encodeURIComponent(tokens.accessToken)}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          ws.send(JSON.stringify({ type: 'subscribe', conversationIds: [conversationId] }))
        }
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { type: string; message?: ChatMessage }
            if (msg.type === 'new_message' && msg.message) upsert(msg.message)
            else if (msg.type === 'message_updated' && msg.message) upsert(msg.message)
          } catch { /* ignore malformed frames */ }
        }
        ws.onclose = () => {
          setConnected(false)
          wsRef.current = null
          // Polling loop keeps us alive; a manual reconnect happens on
          // the next `conversationId` change or component remount.
        }
        ws.onerror = () => {
          if (closedByUs) return
          setConnected(false)
        }
      } catch {
        // Any failure just leaves us in poll-only mode — no user-visible error.
        setConnected(false)
      }
    })()

    // 3. Polling fallback — ticks every pollMs. Cheap because of `since`.
    pollRef.current = setInterval(() => { void refresh() }, pollMs)

    return () => {
      cancelled = true
      closedByUs = true
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      const ws = wsRef.current
      wsRef.current = null
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', conversationIds: [conversationId] })) } catch { /* ignore */ }
      }
      if (ws) try { ws.close() } catch { /* ignore */ }
      setConnected(false)
    }
  }, [conversationId, pollMs, refresh, upsert])

  return { messages, connected, error, send, refresh }
}
