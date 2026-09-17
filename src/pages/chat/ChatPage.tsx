import { useState } from 'react'
import { useChats } from '../../entities/session/session'
import { useSendMessage } from '../../features/send-message/useSendMessage'
import { Sidebar } from '../../widgets/Sidebar'
import { ChatHeader, Composer, Conversation } from '../../widgets/ChatWindow'

/**
 * Composes the workspace and owns the local view state: which chat is selected and
 * one draft per chat, so switching chats keeps each draft where its author left it.
 */
export function ChatPage({ onChangeCredentials }: { onChangeCredentials: () => void }) {
  const chats = useChats()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const selected = chats.find((chat) => chat.id === selectedId) ?? null
  // Clears the submitted chat's draft, and only while it still holds the sent text.
  const { send, sending, error } = useSendMessage((chatId, submitted) =>
    setDrafts((current) =>
      current[chatId] === submitted ? { ...current, [chatId]: '' } : current,
    ),
  )

  return (
    <div className="bg-app text-ink font-sans flex h-full">
      <Sidebar
        chats={chats}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChangeCredentials={onChangeCredentials}
      />
      <main
        className={`flex min-w-0 flex-1 flex-col ${
          selected ? 'bg-linear-to-b from-chat-from to-chat-to' : 'bg-app'
        }`}
      >
        {selected ? (
          <>
            <ChatHeader chat={selected} />
            <Conversation messages={selected.messages} />
          </>
        ) : (
          <p className="text-muted flex-1 content-center px-4 text-center text-[15px]/5">
            Select a chat to start writing.
          </p>
        )}
        <Composer
          draft={selected ? (drafts[selected.id] ?? '') : ''}
          onDraftChange={(text) =>
            selected && setDrafts((current) => ({ ...current, [selected.id]: text }))
          }
          // The chat ID travels with the text, so the result lands where it was sent
          // even if another chat is selected before the response arrives.
          onSend={() => selected && send(selected.id, drafts[selected.id] ?? '')}
          sending={sending}
          error={error}
          disabled={selected === null}
        />
      </main>
    </div>
  )
}
