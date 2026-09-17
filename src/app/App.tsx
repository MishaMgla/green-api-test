import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createSession, SessionContext, useChats, type Session } from '../entities/session/session'
import { LoginForm } from '../features/auth/LoginForm'
import { CreateChatForm } from '../features/create-chat/CreateChatForm'

export function App() {
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return <LoginForm onSubmit={(credentials) => setSession(createSession(credentials))} />
  }

  function changeCredentials() {
    session?.end()
    setSession(null)
  }

  return (
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <Workspace onChangeCredentials={changeCredentials} />
      </SessionContext.Provider>
    </QueryClientProvider>
  )
}

// ponytail: plain chat list placeholder; T06 replaces it with the MAX layout.
function Workspace({ onChangeCredentials }: { onChangeCredentials: () => void }) {
  const chats = useChats()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <main className="bg-app text-ink flex min-h-screen flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">GREEN-API MAX chat</h1>
        <button
          type="button"
          onClick={onChangeCredentials}
          className="border-divider bg-hover rounded border px-3 py-1 focus-visible:outline-2"
        >
          Change credentials
        </button>
      </header>
      <CreateChatForm onSelect={setSelectedId} />
      <ul aria-label="Chats" className="flex flex-col gap-1">
        {chats.map((chat) => (
          <li key={chat.id}>
            <button
              type="button"
              aria-current={chat.id === selectedId}
              onClick={() => setSelectedId(chat.id)}
              className="rounded px-2 py-1 focus-visible:outline-2 aria-[current=true]:bg-selected"
            >
              {chat.name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
