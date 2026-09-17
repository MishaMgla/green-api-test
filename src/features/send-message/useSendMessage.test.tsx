import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ChatPage } from '../../pages/chat/ChatPage'
import { createSession, SessionContext, type Session } from '../../entities/session/session'
import { insertMessage, mapNotification } from '../../entities/conversation/conversation'
import type { Credentials } from '../../shared/api/greenApi'
import { MESSAGE_LIMIT, useSendMessage } from './useSendMessage'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
  apiUrl: 'https://1101.api.green-api.com',
}

const ALICE = '10000000'
const BOB = '20000000'

type Pending = { resolve: (body: unknown) => void; fail: (status: number, body: string) => void }

/** Rejects like fetch does on abort, so `request()` reaches its finally and drops its deadline timer. */
function rejectOnAbort(signal: AbortSignal | null | undefined, reject: (reason: unknown) => void) {
  if (!signal) return
  const abort = () => reject(new DOMException('Aborted', 'AbortError'))
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort)
}

/** Hand-controlled fetch queue, so a send can stay in flight while the test acts. */
function stubFetch() {
  const pending: Pending[] = []
  const fetchMock = vi.fn(
    (_input?: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        rejectOnAbort(init?.signal, reject)
        pending.push({
          resolve: (body) =>
            resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
          fail: (status, body) => resolve({ ok: false, status, text: async () => body }),
        })
      }),
  )
  // The chat page owns the receive loop, whose long poll is not what this file
  // drives: it is answered by a promise that only ever aborts, and kept out of both
  // the queue and the send counter.
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.includes('/receiveNotification')
      ? new Promise((_resolve, reject) => rejectOnAbort(init?.signal, reject))
      : fetchMock(input, init),
  )
  return { fetchMock, pending }
}

/** Sessions started by a test, ended afterwards so their in-flight requests abort. */
const sessions: Session[] = []

function startSession(): Session {
  const session = createSession(CREDENTIALS)
  session.updateChats(() => [
    { id: ALICE, name: 'Alice', messages: [] },
    { id: BOB, name: 'Bob', messages: [] },
  ])
  sessions.push(session)
  return session
}

function provider(session: Session) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  )
}

function renderPage(): Session {
  const session = startSession()
  const Wrapper = provider(session)
  render(
    <Wrapper>
      <ChatPage onChangeCredentials={() => {}} />
    </Wrapper>,
  )
  return session
}

/** Drives the hook alone, so two submissions can be made inside one handler tick. */
function renderSend() {
  const session = startSession()
  const sent: string[] = []
  const { result } = renderHook(() => useSendMessage((_chatId, text) => void sent.push(text)), {
    wrapper: provider(session),
  })
  return { result, sent }
}

/** Merges an outgoing API echo exactly as the receive loop will: same mapping, same updater. */
function echo(session: Session, chatId: string, idMessage: string, text: string) {
  const mapped = mapNotification({
    typeWebhook: 'outgoingAPIMessageReceived',
    idMessage,
    timestamp: 1_700_000_000,
    senderData: { chatId, chatName: 'Alice' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
  })
  if (mapped.type !== 'message') throw new Error('echo fixture is not a message')
  act(() =>
    session.updateChats((chats) =>
      insertMessage(chats, mapped.chatId, mapped.message, mapped.chatName),
    ),
  )
}

const composer = () => screen.getByLabelText('Message')
const open = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
const type = (text: string) => fireEvent.change(composer(), { target: { value: text } })
const sendButton = () => screen.getByRole('button', { name: 'Send message' })
const clickSend = () => fireEvent.click(sendButton())
/** The mutation issues its request off the click, so tests wait for the requests themselves. */
const requested = (pending: Pending[], count: number) =>
  waitFor(() => expect(pending).toHaveLength(count))
const bubbles = () => within(screen.getByRole('log')).queryAllByRole('listitem')
const bubbleTexts = () => bubbles().map((item) => item.querySelector('p')?.textContent)
/** The draft is cleared last in `onSuccess`, so its emptiness means the chat cache is final. */
const sendAccepted = () => waitFor(() => expect(composer()).toHaveValue(''))

afterEach(() => {
  while (sessions.length > 0) sessions.pop()?.end()
  vi.unstubAllGlobals()
})

test('an accepted response adds the message once and clears that draft', async () => {
  const { fetchMock, pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  clickSend()

  // While the send is in flight, a second submission cannot start another one.
  expect(sendButton()).toBeDisabled()
  clickSend()
  await requested(pending, 1)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  pending[0].resolve({ idMessage: 'm1' })
  await sendAccepted()

  await waitFor(() => expect(bubbleTexts()).toEqual(['hello']))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('two submissions in the same tick start one request', async () => {
  const { fetchMock } = stubFetch()
  const { result } = renderSend()

  // Both calls read the same render's `isPending`, which is what the ref guard fixes.
  await act(async () => {
    result.current.send(ALICE, 'hello')
    result.current.send(ALICE, 'hello')
  })

  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('the guard is released by a success and by a failure, and never latched by a rejected draft', async () => {
  const { fetchMock, pending } = stubFetch()
  const { result, sent } = renderSend()

  // Neither a blank draft nor an over-long one may latch the guard.
  await act(async () => {
    result.current.send(ALICE, '   ')
    result.current.send(ALICE, 'a'.repeat(MESSAGE_LIMIT + 1))
  })
  expect(fetchMock).not.toHaveBeenCalled()

  await act(async () => result.current.send(ALICE, 'one'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  pending[0].resolve({ idMessage: 'm1' })
  await waitFor(() => expect(sent).toEqual(['one']))

  await act(async () => result.current.send(ALICE, 'two'))
  expect(fetchMock).toHaveBeenCalledTimes(2)
  pending[1].fail(500, '')
  await waitFor(() => expect(result.current.error?.message).toMatch(/may or may not/))

  await act(async () => result.current.send(ALICE, 'three'))
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('a failed send keeps the draft and calls delivery uncertain', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)
  pending[0].fail(500, '')

  expect(await screen.findByRole('alert')).toHaveTextContent('may or may not have been sent')
  expect(composer()).toHaveValue('hello')
  expect(bubbles()).toHaveLength(0)
})

test('a failure that arrives after a chat switch stays with the chat it was sent to', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)

  open('Bob')
  type('for Bob')
  pending[0].fail(500, '')
  // Bob's composer frees up once the send settles: the outcome has landed by then.
  await waitFor(() => expect(sendButton()).toBeEnabled())

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  open('Alice')
  expect(screen.getByRole('alert')).toHaveTextContent('may or may not have been sent')
})

test('a successful send clears the error left by the previous attempt', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)
  pending[0].fail(500, '')
  await screen.findByRole('alert')

  clickSend()
  await requested(pending, 2)
  pending[1].resolve({ idMessage: 'm1' })
  await sendAccepted()

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await waitFor(() => expect(bubbleTexts()).toEqual(['hello']))
})

test('a whitespace-only draft sends nothing', async () => {
  const { fetchMock, pending } = stubFetch()
  renderPage()

  open('Alice')
  type('   \n  ')

  expect(sendButton()).toBeDisabled()
  clickSend()

  // A real send afterwards is the sync point: it must be the only request made.
  type('hello')
  clickSend()
  await requested(pending, 1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('a draft over the character limit is rejected before any request', async () => {
  const { fetchMock, pending } = stubFetch()
  renderPage()
  const long = 'a'.repeat(MESSAGE_LIMIT + 1)

  open('Alice')
  type(long)
  clickSend()

  expect(await screen.findByRole('alert')).toHaveTextContent(`at most ${MESSAGE_LIMIT} characters`)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(composer()).toHaveValue(long)

  // The rejected draft left nothing latched: a valid one still sends.
  type('hello')
  clickSend()
  await requested(pending, 1)
})

test('Enter sends, but not while an IME composition is being committed', async () => {
  const { fetchMock, pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')

  fireEvent.keyDown(composer(), { key: 'Enter', isComposing: true })
  // A started send would have disabled the button in this same flush.
  expect(sendButton()).toBeEnabled()

  fireEvent.keyDown(composer(), { key: 'Enter' })
  expect(sendButton()).toBeDisabled()
  await requested(pending, 1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('selecting another chat while a send is pending does not redirect the message', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)

  open('Bob')
  type('for Bob')
  pending[0].resolve({ idMessage: 'm1' })
  await waitFor(() => expect(sendButton()).toBeEnabled())

  // The accepted message belongs to the chat it was sent to, not the selected one.
  expect(bubbles()).toHaveLength(0)
  expect(composer()).toHaveValue('for Bob')

  open('Alice')
  await waitFor(() => expect(bubbleTexts()).toEqual(['hello']))
  expect(composer()).toHaveValue('')
})

test('the response and its API echo produce one message, response first', async () => {
  const { pending } = stubFetch()
  const session = renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)
  pending[0].resolve({ idMessage: 'm1' })
  await sendAccepted()
  echo(session, ALICE, 'm1', 'hello')

  await waitFor(() => expect(bubbleTexts()).toEqual(['hello']))
})

test('the response and its API echo produce one message, echo first', async () => {
  const { pending } = stubFetch()
  const session = renderPage()

  open('Alice')
  type('hello')
  clickSend()
  await requested(pending, 1)
  echo(session, ALICE, 'm1', 'hello')
  pending[0].resolve({ idMessage: 'm1' })
  await sendAccepted()

  await waitFor(() => expect(bubbleTexts()).toEqual(['hello']))
})
