import { Fragment, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Chat, Message } from '../entities/conversation/conversation'
import { Avatar } from './Avatar'
import { formatDate, formatTime } from './format'

/** Title bar of the open conversation: avatar, chat name, provider chat ID. */
export function ChatHeader({ chat, onBack }: { chat: Chat; onBack?: () => void }) {
  return (
    <header className="bg-sidebar border-divider flex items-center h-[65px] shrink-0 gap-3 border-b px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к чатам"
          className="hover:bg-ghost-hover focus-visible:outline-accent flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-6">
            <path d="m14 5-7 7 7 7" />
          </svg>
        </button>
      )}
      <Avatar id={chat.id} name={chat.name} size="sm" url={chat.avatarUrl} />
      <div className="min-w-0">
        <h2 className="truncate text-[16px]/5 font-semibold">{chat.name}</h2>
        <p className="text-muted truncate text-[13px]/4">Личный чат</p>
      </div>
    </header>
  )
}

/**
 * Scrollable message history. Text is rendered as plain React text — never as HTML —
 * and the timestamp sits inside the bubble, bottom right, over a reserved spacer so
 * that short messages keep sitting beside it.
 */
export function Conversation({ messages, children }: { messages: Message[]; children?: ReactNode }) {
  const history = useRef<HTMLDivElement>(null)
  const previous = useRef({ firstId: '', lastId: '', height: 0, top: 0 })
  const firstId = messages[0]?.id ?? ''
  const lastId = messages[messages.length - 1]?.id ?? ''

  useLayoutEffect(() => {
    const element = history.current
    if (!element) return
    const before = previous.current
    if (firstId !== before.firstId && lastId === before.lastId && before.firstId) {
      element.scrollTop = before.top + element.scrollHeight - before.height
    } else if (lastId !== before.lastId && (
      !before.lastId ||
      before.height - before.top - element.clientHeight <= 1 ||
      messages[messages.length - 1]?.outgoing
    )) {
      element.scrollTop = element.scrollHeight
    }
    previous.current = { firstId, lastId, height: element.scrollHeight, top: element.scrollTop }
  })

  return (
    <div
      ref={history}
      role="log"
      aria-label="Сообщения"
      onScroll={(event) => { previous.current.top = event.currentTarget.scrollTop }}
      className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
    >
      {children}
      <ol className="mx-auto flex max-w-[732px] flex-col gap-0.5 px-4 py-4">
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {(index === 0 || formatDate(messages[index - 1].timestamp) !== formatDate(message.timestamp)) && (
              <li className="my-2 flex justify-center">
                <span className="rounded-full bg-[#0f8ec285] px-2 text-[13px]/5 tracking-[0.2px] text-white">
                  {formatDate(message.timestamp)}
                </span>
              </li>
            )}
            <li
              className={`flex ${message.outgoing ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-bubble relative max-w-[70%] px-2.5 pt-2 pb-[11px] ${
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
          </Fragment>
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
    // Enter sends, Shift+Enter keeps the newline the author typed, and Enter that
    // commits an IME candidate belongs to the composition, not to the send.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSend()
  }

  return (
    <div className="mx-auto w-full max-w-[740px] shrink-0 px-4 pb-4">
      {/* Busy rather than a spinner: the draft stays visible and editable while the
          send is in flight, and the pending state is still announced and testable. */}
      <form onSubmit={submit} aria-busy={sending}>
        <div className="composer-card bg-sidebar flex items-end gap-1 rounded-2xl p-1 shadow-[0_4px_16px_#00000014,0_0_2px_#00000014]">
          <label htmlFor="composer-text" className="sr-only">
            Сообщение
          </label>
          <textarea
            id="composer-text"
            name="message"
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'Выберите чат' : 'Сообщение'}
            value={draft}
            aria-describedby={error ? 'composer-error' : undefined}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={keyDown}
            className="field-sizing-content min-h-10 max-h-40 min-w-0 flex-1 resize-none rounded-xl px-3 py-2.5 text-[16px]/5 outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Отправить сообщение"
            className="text-accent enabled:hover:bg-ghost-hover focus-visible:outline-accent flex size-10 shrink-0 items-center justify-center rounded-xl disabled:text-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
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
