import { useState } from 'react'
import { useChats } from '../../entities/session/session'
import { useSendMessage } from '../../features/send-message/useSendMessage'
import { Sidebar } from '../../widgets/Sidebar'
import { ChatHeader, Composer, Conversation } from '../../widgets/ChatWindow'
import { useReceiveLoop } from './useReceiveLoop'
import { receiveStatus } from './receiveStatus'
import { useChatDetails } from './useChatDetails'

/**
 * Composes the workspace and owns the local view state: which chat is selected and
 * one draft per chat, so switching chats keeps each draft where its author left it.
 */
export function ChatPage({ onChangeCredentials }: { onChangeCredentials: () => void }) {
  const chats = useChats()
  // The session's one receive owner: polling runs here, independent of selection.
  const { state, retry } = useReceiveLoop()
  const status = receiveStatus(state)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const selected = chats.find((chat) => chat.id === selectedId) ?? null
  const details = useChatDetails(selectedId)
  // Clears the submitted chat's draft, and only while it still holds the sent text.
  const { send, sending, error } = useSendMessage((chatId, submitted) =>
    setDrafts((current) =>
      current[chatId] === submitted ? { ...current, [chatId]: '' } : current,
    ),
  )

  return (
    <div className="bg-app text-ink font-sans flex h-full flex-col">
      {/* Keep recovery visible above both panes, including the mobile chat list. */}
      {status && (
        <div
          role={state.status === 'paused' ? 'alert' : 'status'}
          className="bg-sidebar border-divider flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px]/4"
        >
          <p className={state.status === 'paused' ? 'text-ink' : 'text-muted'}>
            {status.message}
          </p>
          {state.status === 'paused' && (
            <>
              <button
                type="button"
                onClick={retry}
                className="bg-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed focus-visible:outline-accent rounded-lg px-3 py-1 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Повторить
              </button>
              {status.changeCredentials && (
                <button
                  type="button"
                  onClick={onChangeCredentials}
                  className="text-accent focus-visible:outline-accent rounded px-1 py-1 hover:bg-ghost-hover hover:underline focus-visible:outline-2"
                >
                  Сменить данные
                </button>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={`flex shrink-0 ${selected ? 'max-sm:hidden' : ''}`}>
          <Sidebar
            chats={chats}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChangeCredentials={onChangeCredentials}
          />
        </div>
        <main
          className={`flex min-w-0 flex-1 flex-col bg-linear-[28deg] from-chat-from from-[8.03%] to-chat-to to-[91.51%] ${selected ? '' : 'max-sm:hidden'}`}
        >
          {selected ? (
            <>
              <ChatHeader chat={selected} onBack={() => setSelectedId(null)} />
              <Conversation key={selected.id} messages={selected.messages}>
                <div className="mx-auto max-w-[740px] px-4 pt-3 text-center text-[13px]/4">
                  {details.loading ? (
                    <p role="status" className="text-ink">Загружаем историю…</p>
                  ) : details.error || details.contactError ? (
                    <div className="bg-sidebar mx-auto w-fit rounded-xl px-3 py-2">
                      <p role="alert">{details.error ?? details.contactError}</p>
                      <button type="button" onClick={details.retry} className="text-accent mt-1 rounded px-2 py-1 focus-visible:outline-2">
                        Повторить загрузку
                      </button>
                    </div>
                  ) : null}
                  {!details.loading && details.hasMore && !details.error && (
                    <button type="button" onClick={details.loadMore} className="bg-sidebar text-accent rounded-full px-4 py-2 shadow-sm focus-visible:outline-2">
                      Загрузить ещё
                    </button>
                  )}
                </div>
              </Conversation>
            </>
          ) : (
            <p className="text-muted flex-1 content-center px-4 text-center text-[15px]/5">
              Выберите чат, чтобы начать общение
            </p>
          )}
          {selected && <Composer
            draft={drafts[selected.id] ?? ''}
            onDraftChange={(text) =>
              setDrafts((current) => ({ ...current, [selected.id]: text }))
            }
            // The chat ID travels with the text, so the result lands where it was sent
            // even if another chat is selected before the response arrives.
            onSend={() => send(selected.id, drafts[selected.id] ?? '')}
            sending={sending}
            // A failure can arrive after the chat was switched, so it is shown only
            // while its own chat is open — never against a message never sent here.
            error={error?.chatId === selected.id ? error.message : null}
            disabled={false}
          />}
        </main>
      </div>
    </div>
  )
}
