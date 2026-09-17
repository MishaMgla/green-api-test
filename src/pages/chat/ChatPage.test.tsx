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

/** Answers one request: 200 with `body`, or the given failure status. */
type Receive = (body: unknown, status?: number) => void

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
        answers.push((body, status = 200) =>
          resolve({ ok: status < 400, status, text: async () => JSON.stringify(body) }),
        )
      }),
  )
  return answers
}

/** Sessions started by a test, ended afterwards so their in-flight requests abort. */
const sessions: Session[] = []

function renderPage(onChangeCredentials: () => void = () => {}) {
  const session = createSession(CREDENTIALS)
  session.updateChats(() => [
    { id: '10000000', name: 'Alice', messages: [] },
    { id: '20000000', name: 'Bob', messages: [] },
  ])
  sessions.push(session)
  render(
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <ChatPage onChangeCredentials={onChangeCredentials} />
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

test('a transient receive failure shows one quiet line, with or without a chat open', async () => {
  const answers = stubFetch()
  renderPage()

  await waitFor(() => expect(answers).toHaveLength(1))
  answers[0]('', 500)

  const waiting = await screen.findByRole('status')
  expect(waiting).toHaveTextContent(/reconnecting/i)
  // Nothing to act on, and the empty-selection state is untouched behind it.
  expect(within(waiting).queryByRole('button')).toBeNull()
  expect(screen.getByText('Select a chat to start writing.')).toBeVisible()
})

test('a paused receive loop keeps the chat and its draft while offering a retry', async () => {
  const answers = stubFetch()
  renderPage()

  open('Alice')
  type('for Alice')
  await waitFor(() => expect(answers).toHaveLength(1))
  answers[0]('', 401)

  const paused = await screen.findByRole('alert')
  expect(paused).toHaveTextContent(/credentials/i)
  expect(paused.textContent).not.toContain(CREDENTIALS.apiTokenInstance)
  // The workspace survives the failure: same chat, same thread, same draft.
  expect(chatButton('Alice')).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('log', { name: 'Messages' })).toBeVisible()
  expect(composer()).toHaveValue('for Alice')

  fireEvent.click(within(paused).getByRole('button', { name: 'Retry' }))

  // Recovery without a reload: the same owner receives again and the strip goes away.
  await waitFor(() => expect(answers).toHaveLength(2))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(composer()).toHaveValue('for Alice')
})

test('only rejected credentials offer to change them', async () => {
  const onChangeCredentials = vi.fn()
  const answers = stubFetch()
  renderPage(onChangeCredentials)

  await waitFor(() => expect(answers).toHaveLength(1))
  answers[0]('', 466)

  const paused = await screen.findByRole('alert')
  expect(paused).toHaveTextContent(/quota/i)
  expect(within(paused).queryByRole('button', { name: 'Change credentials' })).toBeNull()

  // The same strip on rejected credentials does offer it, and it is the page's own action.
  fireEvent.click(within(paused).getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(answers).toHaveLength(2))
  answers[1]('', 401)

  const rejected = await screen.findByRole('alert')
  fireEvent.click(within(rejected).getByRole('button', { name: 'Change credentials' }))
  expect(onChangeCredentials).toHaveBeenCalledTimes(1)
})
