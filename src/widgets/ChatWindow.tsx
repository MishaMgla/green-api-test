import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import type { Chat, Message } from '../entities/conversation/conversation'
import { Avatar } from './Avatar'
import { formatTime } from './format'

/** Title bar of the open conversation: avatar, chat name, provider chat ID. */
export function ChatHeader({ chat }: { chat: Chat }) {
  return (
    <header className="bg-sidebar border-divider flex items-center gap-3 border-b px-4 py-3">
      <Avatar id={chat.id} name={chat.name} size="sm" />
      <div className="min-w-0">
        <h2 className="truncate text-[16px]/5 font-semibold">{chat.name}</h2>
        <p className="text-muted truncate text-[13px]/4">Chat ID {chat.id}</p>
      </div>
    </header>
  )
}

/**
 * Scrollable message history. Text is rendered as plain React text — never as HTML —
 * and the timestamp sits inside the bubble, bottom right, over a reserved spacer so
 * that short messages keep sitting beside it.
 */
export function Conversation({ messages }: { messages: Message[] }) {
  const history = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => {
    const element = history.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lastId])

  return (
    <div ref={history} role="log" aria-label="Messages" className="flex-1 overflow-y-auto">
      <ol className="mx-auto flex max-w-[732px] flex-col gap-px px-4 py-4">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`flex ${message.outgoing ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`rounded-bubble relative max-w-[70%] px-2.5 pt-2 pb-2.5 ${
                message.outgoing
                  ? 'bg-bubble-out text-bubble-out-ink'
                  : 'bg-bubble-in text-bubble-in-ink'
              }`}
            >
              <p className="text-[16px]/5 break-words whitespace-pre-wrap">
                {message.text}
                {/* Reserves the last line's tail so the absolute timestamp cannot overlap it. */}
                <span aria-hidden className="inline-block w-11" />
              </p>
              <time
                dateTime={new Date(message.timestamp).toISOString()}
                className={`absolute right-2.5 bottom-1.5 text-[12px]/4 tracking-[0.2px] ${
                  message.outgoing ? 'text-bubble-out-time' : 'text-bubble-in-time'
                }`}
              >
                {formatTime(message.timestamp)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export type ComposerProps = {
  draft: string
  onDraftChange: (text: string) => void
  onSend: () => void
  sending: boolean
  error: string | null
  /** True when no chat is selected. */
  disabled: boolean
}

/** Floating write card. Fully controlled: the chat page owns the draft, T07 owns the send. */
export function Composer({
  draft,
  onDraftChange,
  onSend,
  sending,
  error,
  disabled,
}: ComposerProps) {
  const canSend = !disabled && !sending && draft.trim() !== ''

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canSend) onSend()
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter keeps the newline the author typed.
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (canSend) onSend()
  }

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 pb-4">
      <form onSubmit={submit}>
        <div className="bg-sidebar flex items-end gap-1 rounded-2xl p-1 shadow-[0_4px_16px_#00000014,0_0_2px_#00000014]">
          <label htmlFor="composer-text" className="sr-only">
            Message
          </label>
          <textarea
            id="composer-text"
            name="message"
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'Select a chat to write' : 'Write a message'}
            value={draft}
            aria-describedby={error ? 'composer-error' : undefined}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={keyDown}
            className="focus-visible:outline-accent field-sizing-content max-h-40 flex-1 resize-none rounded-xl px-3 py-2 text-[16px]/5 focus-visible:outline-2 focus-visible:-outline-offset-2"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="bg-accent focus-visible:outline-accent flex size-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <SendIcon />
          </button>
        </div>
      </form>
      {error && (
        <p id="composer-error" role="alert" className="text-ink mt-2 text-[13px]/4">
          {error}
        </p>
      )}
    </div>
  )
}

/** Drawn here on purpose: the reference ships no icon files and we add no icon library. */
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8Z" />
    </svg>
  )
}
