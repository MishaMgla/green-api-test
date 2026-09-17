import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ChatPage } from './ChatPage'
import { createSession, SessionContext, type Session } from '../../entities/session/session'
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
  vi.stubGlobal(
    'fetch',
    (_input: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        // Aborting must reject, exactly as fetch does: otherwise `request()` never
        // reaches its finally and its deadline timer outlives the unmounted page.
        const signal = init?.signal
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal?.aborted) abort()
        else signal?.addEventListener('abort', abort)
        answers.push((body) =>
          resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
        )
      }),
  )
  return answers
}

/** Sessions started by a test, ended afterwards so their in-flight requests abort. */
const sessions: Session[] = []

function renderPage() {
  const session = createSession(CREDENTIALS)
  session.updateChats(() => [
    { id: '10000000', name: 'Alice', messages: [] },
    { id: '20000000', name: 'Bob', messages: [] },
  ])
  sessions.push(session)
  render(
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <ChatPage onChangeCredentials={() => {}} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
  return session
}

const composer = () => screen.getByLabelText('Message')
const chatButton = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const open = (name: string) => fireEvent.click(chatButton(name))
const type = (text: string) => fireEvent.change(composer(), { target: { value: text } })

afterEach(() => {
  while (sessions.length > 0) sessions.pop()?.end()
  vi.unstubAllGlobals()
})

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

  // The loop's first long poll is what carries the new chat.
  await waitFor(() => expect(answers).toHaveLength(1))
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

  // Carol on screen is the outcome to wait for; everything else is asserted after it.
  await screen.findByRole('button', { name: /Carol/ })
  const chats = within(screen.getByRole('list', { name: 'Chats' })).getAllByRole('listitem')
  expect(chats.map((item) => item.textContent)).toEqual([
    expect.stringContaining('Alice'),
    expect.stringContaining('Bob'),
    expect.stringContaining('Carol'),
  ])
  // The selection, its draft and its thread stay put.
  expect(chatButton('Alice')).toHaveAttribute('aria-current', 'true')
  expect(composer()).toHaveValue('for Alice')
  expect(within(screen.getByRole('log')).queryAllByRole('listitem')).toHaveLength(0)
})
