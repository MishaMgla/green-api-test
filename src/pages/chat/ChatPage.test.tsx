import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ChatPage } from './ChatPage'
import { createSession, SessionContext } from '../../entities/session/session'
import type { Credentials } from '../../shared/api/greenApi'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
  apiUrl: 'https://1101.api.green-api.com',
}

function renderPage() {
  const session = createSession(CREDENTIALS)
  session.updateChats(() => [
    { id: '10000000', name: 'Alice', messages: [] },
    { id: '20000000', name: 'Bob', messages: [] },
  ])
  render(
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <ChatPage onChangeCredentials={() => {}} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

const composer = () => screen.getByLabelText('Message')
const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
const type = (text: string) => fireEvent.change(composer(), { target: { value: text } })

test('switching chats preserves the correct per-chat draft', () => {
  renderPage()
  expect(composer()).toBeDisabled()

  open('Alice')
  type('for Alice')

  open('Bob')
  expect(composer()).toHaveValue('')
  type('for Bob')

  open('Alice')
  expect(composer()).toHaveValue('for Alice')

  open('Bob')
  expect(composer()).toHaveValue('for Bob')
})
