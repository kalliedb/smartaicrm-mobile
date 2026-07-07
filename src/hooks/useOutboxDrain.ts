/**
 * useOutboxDrain — drives the offline outbox on the FA's behalf.
 *
 * Triggers:
 *   1. On mount (fresh app launch — hydrate any queue left from a crash).
 *   2. Whenever the app returns to the foreground (AppState 'active').
 *   3. On a 30s timer while the app is open (survives a socket drop
 *      that we didn't otherwise notice).
 *
 * Returns the current queue depth so we can render a pill ("2 pending")
 * on the cases list.
 */
import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { drain, size } from '@utils/outbox'

interface Options {
  intervalMs?: number
}

export function useOutboxDrain({ intervalMs = 30_000 }: Options = {}) {
  const [pending, setPending] = useState(0)
  const [draining, setDraining] = useState(false)

  const refreshCount = useCallback(async () => {
    setPending(await size())
  }, [])

  const attemptDrain = useCallback(async () => {
    if (draining) return
    setDraining(true)
    try {
      const result = await drain()
      setPending(result.remaining)
      return result
    } finally {
      setDraining(false)
    }
  }, [draining])

  useEffect(() => {
    void refreshCount()
    void attemptDrain()

    const timer = setInterval(() => { void attemptDrain() }, intervalMs)
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void attemptDrain()
    })

    return () => {
      clearInterval(timer)
      sub.remove()
    }
    // attemptDrain / refreshCount are stable-ish; intervalMs is the only
    // real dep that would need a fresh interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])

  return { pending, draining, refreshCount, attemptDrain }
}
