import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { insertMessage } from '../../entities/conversation/conversation'
import { useSession } from '../../entities/session/session'
import { GreenApiError, sendMessage, type GreenApiErrorKind } from '../../shared/api/greenApi'

/** Longest text accepted for one outgoing message. */
export const MESSAGE_LIMIT = 4000

const TOO_LONG = `A message can be at most ${MESSAGE_LIMIT} characters. Shorten it and send again.`
/** Said whenever the outcome is unknown: the message may still have reached the recipient. */
const UNCERTAIN =
  'The instance did not answer, so this message may or may not have been sent. Check the chat in MAX before sending it again.'

// Sending needs its own wording rather than the lookup table: the same failure kind
// asks for a different action here, and `transport` means uncertain delivery, not failure.
const BY_KIND: Partial<Record<GreenApiErrorKind, string>> = {
  unauthorized: 'The instance rejected these credentials. Change credentials and send again.',
  suspended: 'This GREEN-API account is suspended. Check its status in the dashboard.',
  instanceUnavailable: 'The instance is not ready. Authorize it in the dashboard, then send again.',
  instanceStarting: 'The instance is restarting. Wait a few seconds and send again.',
  quotaExceeded: 'The plan quota is exhausted. Upgrade the plan to keep sending.',
  rateLimited: 'Too many requests to this instance. Wait a few seconds and send again.',
}

/** Actionable, credential-free text for a failed send. */
function sendErrorMessage(failure: unknown): string {
  return (failure instanceof GreenApiError ? BY_KIND[failure.kind] : undefined) ?? UNCERTAIN
}

type Submission = { chatId: string; text: string }

/** A failure belongs to the chat it was submitted for, never to the selected one. */
export type SendError = { chatId: string; message: string }

/**
 * Sends one message at a time into the chat captured at submission, so changing the
 * selected chat while the request is in flight cannot redirect the result. `onSent`
 * receives that same chat and text, so only the submitted draft is cleared.
 */
export function useSendMessage(onSent: (chatId: string, text: string) => void) {
  const session = useSession()
  const [error, setError] = useState<SendError | null>(null)
  // `mutation.isPending` is a render snapshot: two `send()` calls in one handler tick
  // both read the stale `false` and submit. This flips synchronously, so the second
  // one is refused before it can duplicate the message in the recipient's chat.
  const inFlight = useRef(false)

  const mutation = useMutation({
    // No automatic retry: a lost response can still mean the message was accepted,
    // so a retry could duplicate a real message in the recipient's chat.
    retry: false,
    // Released here rather than in onSuccess/onError, so an outcome discarded as
    // belonging to an ended session still unlatches the guard.
    onSettled: () => {
      inFlight.current = false
    },
    mutationFn: ({ chatId, text }: Submission) =>
      sendMessage(session.credentials, chatId, text, session.signal),
    onSuccess: (idMessage, { chatId, text }) => {
      // A completion that outlived its session must not reach a replacement one.
      if (!session.isActive()) return
      // An accepted response is not a delivery confirmation, so the message is shown
      // as written and never as delivered. Going through the shared updater keyed by
      // idMessage means this and the API echo produce one message, in either order.
      session.updateChats((chats) =>
        insertMessage(chats, chatId, {
          id: idMessage,
          text,
          outgoing: true,
          timestamp: Date.now(),
        }),
      )
      onSent(chatId, text)
    },
    onError: (failure, { chatId }) => {
      if (!session.isActive()) return
      setError({ chatId, message: sendErrorMessage(failure) })
    },
  })

  return {
    sending: mutation.isPending,
    error,
    /** Ignores blank drafts and any submission made while one is still in flight. */
    send(chatId: string, draft: string) {
      if (inFlight.current || draft.trim() === '') return
      if (draft.length > MESSAGE_LIMIT) {
        setError({ chatId, message: TOO_LONG })
        return
      }
      // Only this chat's own error is cleared: another chat's failure still stands.
      setError((current) => (current?.chatId === chatId ? null : current))
      inFlight.current = true
      // The draft is kept until the send succeeds, so a failure leaves it editable.
      mutation.mutate({ chatId, text: draft })
    },
  }
}
