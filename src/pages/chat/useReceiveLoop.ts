import { useCallback, useEffect, useRef, useState } from 'react'
import { insertMessage, mapNotification } from '../../entities/conversation/conversation'
import { useSession } from '../../entities/session/session'
import {
  deleteNotification,
  GreenApiError,
  receiveNotification,
  type GreenApiErrorKind,
} from '../../shared/api/greenApi'

/** Seconds between transient failures; the last step repeats until a cycle succeeds. */
const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 30]

/**
 * Failures no amount of waiting resolves: they need different credentials or a
 * dashboard change, so the loop pauses instead of spinning on the same error.
 */
const PAUSING: ReadonlySet<GreenApiErrorKind> = new Set([
  'unauthorized',
  'suspended',
  'instanceUnavailable',
  'quotaExceeded',
])

export type ReceiveLoop = {
  /** The failure the loop is paused on, or null while it is polling. */
  failure: GreenApiErrorKind | null
  /** Resumes the paused owner. A no-op while the loop is polling. */
  retry: () => void
}

/** Resolves after `ms`, or as soon as the owner is cancelled: no orphan timer. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}

/**
 * Runs the session's single receive → map/merge → acknowledge → receive loop,
 * independent of the selected chat. Each cycle awaits its own request, so
 * requests never overlap, and an empty queue starts the next cycle at once.
 */
export function useReceiveLoop(): ReceiveLoop {
  const session = useSession()
  const [failure, setFailure] = useState<GreenApiErrorKind | null>(null)
  // Set only while the loop waits for a manual retry; calling it resumes that
  // same owner, so recovery can never start a second loop.
  const resume = useRef<(() => void) | null>(null)

  useEffect(() => {
    // One owner per session, cancelled by its own controller as well as by the
    // session's signal. A StrictMode remount or a credentials change therefore
    // aborts the in-flight request and every wait before the next owner starts.
    // A new owner polls; it never inherits the failure the previous one paused on.
    setFailure(null)
    const owner = new AbortController()
    const signal = owner.signal
    const stop = () => owner.abort()
    session.signal.addEventListener('abort', stop)
    const alive = () => !signal.aborted && session.isActive()

    const pause = () =>
      new Promise<void>((resolve) => {
        const done = () => {
          resume.current = null
          signal.removeEventListener('abort', done)
          resolve()
        }
        resume.current = done
        signal.addEventListener('abort', done)
      })

    async function run() {
      let failures = 0
      while (alive()) {
        try {
          const notification = await receiveNotification(session.credentials, signal)
          // A completion that outlived its owner must not start an acknowledgement.
          if (!alive()) return
          if (notification) {
            const mapped = mapNotification(notification.body)
            if (mapped.type === 'message') {
              session.updateChats((chats) =>
                insertMessage(chats, mapped.chatId, mapped.message, mapped.chatName),
              )
            }
            // Acknowledge only what was merged or deliberately discarded, and only
            // after the fact: an unexpected mapping or merging failure throws past
            // this line, so a real message is never dropped from the queue. A
            // discarded body keeps a valid receipt, which must be acknowledged or
            // it blocks the queue forever.
            await deleteNotification(session.credentials, notification.receiptId, signal)
            if (!alive()) return
          }
          failures = 0
        } catch (error) {
          if (!alive()) return
          if (error instanceof GreenApiError && PAUSING.has(error.kind)) {
            setFailure(error.kind)
            await pause()
            if (!alive()) return
            setFailure(null)
            failures = 0
            continue
          }
          // Everything else — transport, rate limits, an unsuccessful or lost
          // acknowledgement, an unexpected processing failure — backs off and
          // receives the head again. A merged message stays merged; redelivery is
          // harmless because insertion is idempotent on message ID, and receiving
          // again lets the queue progress when a delete response was lost.
          await wait(BACKOFF_SECONDS[Math.min(failures, BACKOFF_SECONDS.length - 1)] * 1000, signal)
          failures += 1
        }
      }
    }

    void run()
    return () => {
      session.signal.removeEventListener('abort', stop)
      owner.abort()
    }
  }, [session])

  // ponytail: a plain effect, not a query, so there is no refetch-on-focus or
  // reconnect behaviour to disable — only this owner ever starts a request.
  return { failure, retry: useCallback(() => resume.current?.(), []) }
}
