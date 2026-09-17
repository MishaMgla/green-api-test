import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ChatPage } from './ChatPage'
import { createSession, SessionContext } from '../../entities/session/session'
import type { Credentials } from '../../shared/api/greenApi'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
  apiUrl: 'https://1101.api.green-api.com',
}

type Receive = (body: unknown) => void

/** Answers the page's receive loop by hand; nothing else in these tests fetches. */
function stubFetch(): Receive[] {
  const answers: Receive[] = []
  vi.stubGlobal('fetch', () =>
    new Promise((resolve) => {
      answers.push((body) =>
        resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
      )
    }),
  )
  return answers
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
  return session
}

/**
 * Lets the receive cycle and the chat cache's zero-delay notification land. Two
 * turns, because the notification is scheduled from the turn that merges the message.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const composer = () => screen.getByLabelText('Message')
const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
const type = (text: string) => fireEvent.change(composer(), { target: { value: text } })

afterEach(() => vi.unstubAllGlobals())

test('switching chats preserves the correct per-chat draft', () => {
  stubFetch()
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

test('an incoming chat is added without stealing the current selection', async () => {
  const answers = stubFetch()
  renderPage()

  open('Alice')
  type('for Alice')
  await settle()

  answers[0]({
    receiptId: 1,
    body: {
      typeWebhook: 'incomingMessageReceived',
      idMessage: 'm1',
      timestamp: 1_700_000_000,
      senderData: { chatId: '30000000', chatName: 'Carol' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'hi' } },
    },
  })
  await settle()

  // The new chat is listed, while the selection, its draft and its thread stay put.
  const chats = within(screen.getByRole('list', { name: 'Chats' })).getAllByRole('listitem')
  expect(chats.map((item) => item.textContent)).toEqual([
    expect.stringContaining('Alice'),
    expect.stringContaining('Bob'),
    expect.stringContaining('Carol'),
  ])
  expect(composer()).toHaveValue('for Alice')
  expect(within(screen.getByRole('log')).queryAllByRole('listitem')).toHaveLength(0)
})
