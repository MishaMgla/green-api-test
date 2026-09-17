import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createSession, SessionContext, type Session } from '../entities/session/session'
import { LoginForm } from '../features/auth/LoginForm'
import { ChatPage } from '../pages/chat/ChatPage'

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
        <ChatPage onChangeCredentials={changeCredentials} />
      </SessionContext.Provider>
    </QueryClientProvider>
  )
}
