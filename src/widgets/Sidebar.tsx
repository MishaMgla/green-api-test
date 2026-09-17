import { useState } from 'react'
import type { Chat } from '../entities/conversation/conversation'
import { CreateChatForm } from '../features/create-chat/CreateChatForm'
import { Avatar } from './Avatar'
import { formatTime } from './format'

type SidebarProps = {
  chats: Chat[]
  selectedId: string | null
  onSelect: (chatId: string) => void
  onChangeCredentials: () => void
}

/** Left panel: title row, the new-chat form, and the selectable chat list. */
export function Sidebar({ chats, selectedId, onSelect, onChangeCredentials }: SidebarProps) {
  const [creating, setCreating] = useState(chats.length === 0)

  function selectChat(chatId: string) {
    setCreating(false)
    onSelect(chatId)
  }

  return (
    <>
      <nav aria-label="Навигация" className="bg-sidebar border-divider flex w-[77px] shrink-0 flex-col items-center border-r py-5 max-sm:w-14">
        <span aria-current="page" className="text-accent flex w-full flex-col items-center gap-1 text-[11px]/4">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-7">
            <path d="M12 3a9 9 0 0 0-8.05 13.02L3 21l4.98-.95A9 9 0 1 0 12 3Zm-4 8h8v2H8Z" />
          </svg>
          Чаты
        </span>
        <button
          type="button"
          onClick={onChangeCredentials}
          aria-label="Сменить данные"
          title="Сменить данные"
          className="text-muted hover:text-ink hover:bg-ghost-hover focus-visible:outline-accent mt-auto flex size-12 items-center justify-center rounded-xl focus-visible:outline-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-6">
            <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M14 7l5 5-5 5M8 12h11" />
          </svg>
        </button>
      </nav>
      <aside className="bg-sidebar border-divider flex w-[304px] shrink-0 flex-col border-r max-md:w-[280px] max-sm:w-[calc(100vw-56px)]">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <h1 className="text-[24px]/7 font-semibold">Чаты</h1>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            aria-label="Новый чат"
            aria-expanded={creating}
            aria-controls="new-chat-form"
            className="bg-accent hover:bg-accent-hover focus-visible:outline-accent flex size-8 items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden className="size-5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {creating && (
          <div id="new-chat-form" className="border-divider border-b px-4 pb-4">
            <CreateChatForm onSelect={selectChat} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {chats.length === 0 && (
            <p className="text-muted px-4 py-6 text-[15px]/5">
              Пока нет чатов. Введите номер телефона, чтобы начать общение.
            </p>
          )}
          <ul aria-label="Чаты">
            {chats.map((chat) => (
              <li key={chat.id}>
                <ChatListItem
                  chat={chat}
                  selected={chat.id === selectedId}
                  onSelect={() => selectChat(chat.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  )
}

function ChatListItem({
  chat,
  selected,
  onSelect,
}: {
  chat: Chat
  selected: boolean
  onSelect: () => void
}) {
  const last = chat.messages[chat.messages.length - 1]
  return (
    <button
      type="button"
      aria-current={selected}
      onClick={onSelect}
      className="hover:bg-hover focus-visible:outline-accent aria-[current=true]:bg-selected flex w-full items-center gap-3 px-4 py-[9px] min-h-[82px] text-left focus-visible:-outline-offset-2 focus-visible:outline-2"
    >
      <span className="flex size-16 shrink-0 items-center justify-center"><Avatar id={chat.id} name={chat.name} size="lg" url={chat.avatarUrl} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 truncate text-[15px]/5 font-medium tracking-[0.15px]">
            {chat.name}
          </span>
          {last && (
            <span className="text-muted shrink-0 text-[13px]/4 tracking-[0.2px]">
              {formatTime(last.timestamp)}
            </span>
          )}
        </span>
        <span className="text-muted line-clamp-2 text-[15px]/5 tracking-[0.15px] break-words">
          {last ? last.text : 'Нет сообщений'}
        </span>
      </span>
    </button>
  )
}
