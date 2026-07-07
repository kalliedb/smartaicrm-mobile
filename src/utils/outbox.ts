/**
 * Offline outbox — AsyncStorage-backed queue of user actions that failed
 * to reach the server. Drains on foreground / periodic tick / explicit
 * trigger (e.g. after login).
 *
 * We intentionally keep this JSON-in-AsyncStorage rather than reaching
 * for expo-sqlite: the queue rarely holds more than a handful of items,
 * SQLite is a big native dep, and JSON gives us zero-schema evolution
 * headaches when we add new item kinds.
 *
 * Kinds supported today:
 *   - 'chat_send'         — a message the FA composed without signal
 *   - 'case_status'       — a status transition (with optional geo) that
 *                            didn't reach /fs/cases/:id/status
 *
 * Adding a new kind is one enum entry + a switch case in `drain`. No
 * schema migration needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { chatApi } from '@api/chat'
import { casesApi, type ServiceCaseStatus } from '@api/cases'

const STORAGE_KEY = '@aivera-field/outbox/v1'

export type OutboxKind = 'chat_send' | 'case_status'

interface OutboxBase {
  id: string                    // client-generated uuid-ish; used for dedupe
  kind: OutboxKind
  createdAt: number             // epoch ms
  attempts: number
  lastError?: string
}

export interface OutboxChatSend extends OutboxBase {
  kind: 'chat_send'
  conversationId: string
  body: string
}

export interface OutboxCaseStatus extends OutboxBase {
  kind: 'case_status'
  caseId: string
  next: ServiceCaseStatus
  geo?: { lat: number; lng: number }
}

export type OutboxItem = OutboxChatSend | OutboxCaseStatus

function newId(): string {
  // Good-enough client id; the server generates the real row id when the
  // item drains. Only needs to be locally unique for dedupe.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function readAll(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OutboxItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

// Distributive Omit — plain Omit<OutboxItem, ...> collapses a
// discriminated union to its common keys (losing conversationId /
// caseId). Distributing over each variant preserves the shape.
type OmitDistr<T, K extends keyof T | string> = T extends unknown
  ? Omit<T, Extract<K, keyof T>>
  : never
export type OutboxDraft = OmitDistr<OutboxItem, 'id' | 'createdAt' | 'attempts'>

export async function enqueue(item: OutboxDraft): Promise<OutboxItem> {
  const stored: OutboxItem = {
    ...item,
    id: newId(),
    createdAt: Date.now(),
    attempts: 0,
  } as OutboxItem
  const list = await readAll()
  list.push(stored)
  await writeAll(list)
  return stored
}

export async function size(): Promise<number> {
  return (await readAll()).length
}

/**
 * Try to send every queued item. Successful items are dropped; failed
 * items stay with an incremented attempt count. Idempotent: if the
 * server ends up with a duplicate (rare — server dedupes on message
 * body + author + minute for chat), no double-render on our side.
 */
export async function drain(): Promise<{ sent: number; failed: number; remaining: number }> {
  const list = await readAll()
  if (list.length === 0) return { sent: 0, failed: 0, remaining: 0 }

  let sent = 0
  let failed = 0
  const remaining: OutboxItem[] = []

  for (const item of list) {
    try {
      switch (item.kind) {
        case 'chat_send':
          await chatApi.send(item.conversationId, item.body)
          break
        case 'case_status':
          await casesApi.transition(item.caseId, item.next, item.geo)
          break
      }
      sent++
    } catch (e) {
      failed++
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  await writeAll(remaining)
  return { sent, failed, remaining: remaining.length }
}

export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
