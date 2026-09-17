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
  return (
    <aside className="bg-sidebar border-divider flex w-[303px] shrink-0 flex-col border-r">
      <div className="border-divider flex items-center justify-between gap-2 border-b px-4 py-3">
        <h1 className="text-[16px]/5 font-semibold tracking-[0.15px]">Chats</h1>
        <button
          type="button"
          onClick={onChangeCredentials}
          className="text-accent focus-visible:outline-accent rounded px-2 py-1 text-[13px]/4 hover:bg-ghost-hover hover:underline focus-visible:outline-2"
        >
          Change credentials
        </button>
      </div>

      <div className="border-divider border-b px-4 py-3">
        <CreateChatForm onSelect={onSelect} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 && (
          <p className="text-muted px-4 py-6 text-[15px]/5">
            No chats yet. Enter a phone number above to start one.
          </p>
        )}
        <ul aria-label="Chats">
          {chats.map((chat) => (
            <li key={chat.id}>
              <ChatListItem
                chat={chat}
                selected={chat.id === selectedId}
                onSelect={() => onSelect(chat.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </aside>
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
      className="hover:bg-hover focus-visible:outline-accent aria-[current=true]:bg-selected flex w-full items-center gap-3 px-4 py-[9px] text-left focus-visible:-outline-offset-2 focus-visible:outline-2"
    >
      <Avatar id={chat.id} name={chat.name} size="lg" />
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
          {last ? last.text : 'No messages yet'}
        </span>
      </span>
    </button>
  )
}
