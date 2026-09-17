import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { checkAccount } from '../../shared/api/greenApi'
import { normalizePhone } from '../../shared/lib/phone'
import type { Chat } from '../../entities/conversation/conversation'
import { useSession } from '../../entities/session/session'
import { lookupErrorMessage, NoAccountError } from './lookupError'

const INVALID_PHONE =
  'Enter a Russian (7XXXXXXXXXX) or Belarusian (375XXXXXXXXX) number.'

/** Adds the chat unless the session already has it; reception may have created it. */
function withChat(chats: Chat[], chatId: string): Chat[] {
  return chats.some((chat) => chat.id === chatId)
    ? chats
    : [...chats, { id: chatId, name: chatId, messages: [] }]
}

/** Resolves a phone number to its canonical chat ID, then inserts and selects that chat. */
export function CreateChatForm({ onSelect }: { onSelect: (chatId: string) => void }) {
  const session = useSession()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lookup = useMutation({
    mutationFn: async (digits: string) => {
      const known = session.knownChatIds.get(digits)
      if (known !== undefined) return known
      const account = await checkAccount(session.credentials, digits, session.signal)
      // An unsuccessful or malformed response must not create a chat; the client
      // already rejects malformed bodies, so only `exist: false` is left here.
      if (!account.exist) throw new NoAccountError()
      session.knownChatIds.set(digits, account.chatId)
      return account.chatId
    },
    onSuccess: (chatId) => {
      // A completion that outlived its session must not reach a replacement one.
      if (!session.isActive()) return
      session.updateChats((chats) => withChat(chats, chatId))
      onSelect(chatId)
      setPhone('')
    },
    onError: (failure) => setError(lookupErrorMessage(failure)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const digits = normalizePhone(phone)
    if (digits === null) {
      setError(INVALID_PHONE)
      return
    }
    setError(null)
    lookup.mutate(digits)
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor="new-chat-phone">Phone number</label>
      <div className="flex gap-2">
        <input
          id="new-chat-phone"
          name="phone"
          type="tel"
          autoComplete="off"
          placeholder="79991234567"
          value={phone}
          aria-invalid={error !== null}
          aria-describedby={error ? 'new-chat-error' : undefined}
          onChange={(event) => setPhone(event.target.value)}
          className="border-divider rounded border px-2 py-1 focus-visible:outline-2"
        />
        <button
          type="submit"
          disabled={lookup.isPending}
          className="border-divider bg-hover rounded border px-3 py-1 focus-visible:outline-2"
        >
          {lookup.isPending ? 'Checking…' : 'Create chat'}
        </button>
      </div>
      {error && (
        <p id="new-chat-error" role="alert" className="text-muted">
          {error}
        </p>
      )}
    </form>
  )
}
