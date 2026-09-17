import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App'
import { createSession, chatsKey } from '../entities/session/session'
import type { Credentials } from '../shared/api/greenApi'
import type { Chat } from '../entities/conversation/conversation'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
  apiUrl: 'https://1101.api.green-api.com',
}

type Pending = { signal: AbortSignal | null | undefined; resolve: (body: unknown) => void }
/** One long poll, answerable by the test: a notification body, or a failure status. */
type Poll = { resolve: (body: unknown) => void; fail: (status: number) => void }

/** Replaces fetch with a hand-controlled queue; no request ever leaves the test. */
function stubFetch(honourAbort = true) {
  const pending: Pending[] = []
  // The chat page owns the receive loop, whose long poll is not what most of these
  // tests drive. Each poll waits in `polls` and settles only when a test answers it,
  // so the hand-controlled queue keeps holding only the other requests under test.
  const polls: Poll[] = []
  const receiveMock = vi.fn(
    () =>
      new Promise((resolve) => {
        polls.push({
          resolve: (body) =>
            resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
          fail: (status) => resolve({ ok: false, status, text: async () => '' }),
        })
      }),
  )
  const fetchMock = vi.fn(
    (_input: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        pending.push({
          signal: init?.signal,
          resolve: (body) =>
            resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
        })
        if (honourAbort) {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }
      }),
  )
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
    input.includes('/receiveNotification') ? receiveMock() : fetchMock(input, init),
  )
  return { fetchMock, receiveMock, pending, polls }
}

function login(overrides: Partial<Credentials> = {}) {
  const fields = { ...CREDENTIALS, ...overrides }
  fireEvent.change(screen.getByLabelText('Instance ID'), { target: { value: fields.idInstance } })
  fireEvent.change(screen.getByLabelText('API token'), { target: { value: fields.apiTokenInstance } })
  fireEvent.change(screen.getByLabelText('Dashboard API origin'), { target: { value: fields.apiUrl } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

async function createChat(phone: string) {
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: phone } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create chat' }))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

test('mounts the login form', () => {
  render(<App />)
  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible()
})

test.each([
  ['a non-HTTPS origin', { apiUrl: 'http://1101.api.green-api.com' }],
  ['an origin with a path', { apiUrl: 'https://1101.api.green-api.com/waInstance' }],
  ['an origin with userinfo', { apiUrl: 'https://user:pass@1101.api.green-api.com' }],
  ['an origin with a query', { apiUrl: 'https://1101.api.green-api.com/?a=1' }],
  ['a malformed instance ID', { idInstance: '1101-000001' }],
  ['an empty token', { apiTokenInstance: '   ' }],
])('%s cannot start a session', (_name, overrides) => {
  const { fetchMock } = stubFetch()
  render(<App />)
  login(overrides)

  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Change credentials' })).toBeNull()
  expect(screen.getByRole('alert')).toBeVisible()
  // No eager queue probe either: logging in must not call the provider at all.
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a valid login starts a session and only the receive loop', () => {
  const { fetchMock, receiveMock } = stubFetch()
  render(<App />)
  login()

  expect(screen.getByRole('button', { name: 'Change credentials' })).toBeVisible()
  // No eager queue probe: the session's only request is its one receive owner.
  expect(fetchMock).not.toHaveBeenCalled()
  expect(receiveMock).toHaveBeenCalledTimes(1)
})

test('credentials never enter storage', async () => {
  document.cookie = ''
  const { pending } = stubFetch()
  render(<App />)
  login()
  await createChat('79991234567')
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))

  const stored = [
    ...Object.entries(localStorage),
    ...Object.entries(sessionStorage),
    document.cookie,
  ].join('|')
  expect(localStorage).toHaveLength(0)
  expect(sessionStorage).toHaveLength(0)
  expect(stored).not.toContain(CREDENTIALS.apiTokenInstance)
  expect(stored).not.toContain(CREDENTIALS.idInstance)
})

test('credentials never enter a cache key, and updates stop once the session ends', () => {
  const session = createSession(CREDENTIALS)
  session.updateChats((chats) => [...chats, { id: '10000000', name: '10000000', messages: [] }])

  const keys = session.queryClient.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey))
  expect(keys).toEqual([JSON.stringify(chatsKey)])
  expect(keys.join()).not.toContain(CREDENTIALS.apiTokenInstance)
  expect(keys.join()).not.toContain(CREDENTIALS.idInstance)

  session.end()
  expect(session.isActive()).toBe(false)
  expect(session.signal.aborted).toBe(true)
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)).toBeUndefined()
  session.updateChats(() => [{ id: '999', name: '999', messages: [] }])
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)).toBeUndefined()
})

test('ending a session aborts its registered work and returns to the login form', async () => {
  const { pending } = stubFetch()
  render(<App />)
  login()
  await createChat('79991234567')
  expect(pending[0].signal?.aborted).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'Change credentials' }))

  expect(pending[0].signal?.aborted).toBe(true)
  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible()
})

test('a late lookup result cannot reach a replacement session', async () => {
  // This stub ignores the abort, so the stale completion really does arrive.
  const { pending } = stubFetch(false)
  render(<App />)
  login()
  await createChat('79991234567')

  fireEvent.click(screen.getByRole('button', { name: 'Change credentials' }))
  login({ idInstance: '1101000002' })
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))

  expect(screen.getByRole('list', { name: 'Chats' })).toBeEmptyDOMElement()
})

test('login → create → send → receive → change credentials recovers without a reload', async () => {
  // A token unlike any other string on the page, so the leak check cannot pass by luck.
  const token = 'secret-token-value'
  const { pending, polls } = stubFetch()
  render(<App />)
  login({ apiTokenInstance: token })

  // Create: the lookup resolves the number to its canonical chat ID and selects it.
  await createChat('79991234567')
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))
  const composer = screen.getByLabelText('Message')
  const form = composer.closest('form')
  expect(composer).toBeEnabled()

  // Send: the draft stays readable and the composer reports itself busy meanwhile.
  fireEvent.change(composer, { target: { value: 'hello there' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  })
  expect(form).toHaveAttribute('aria-busy', 'true')
  expect(composer).toHaveValue('hello there')
  await act(async () => pending[1].resolve({ idMessage: 'out-1' }))
  const log = screen.getByRole('log', { name: 'Messages' })
  expect(await within(log).findByText('hello there')).toBeVisible()
  expect(form).toHaveAttribute('aria-busy', 'false')

  // A new draft, so the receive failure has both a message and a draft to preserve.
  fireEvent.change(composer, { target: { value: 'still typing' } })

  // Receive fails on credentials: the loop pauses and says so, replacing nothing.
  await waitFor(() => expect(polls).toHaveLength(1))
  await act(async () => polls[0].fail(401))
  const paused = await screen.findByRole('alert')
  expect(paused).toHaveTextContent(/credentials/i)
  expect(within(log).getByText('hello there')).toBeVisible()
  expect(composer).toHaveValue('still typing')
  expect(document.body.innerHTML).not.toContain(token)
  expect(document.body.innerHTML).not.toContain(CREDENTIALS.idInstance)

  // Retry resumes the same owner in place: no reload, and the next message arrives.
  fireEvent.click(within(paused).getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(polls).toHaveLength(2))
  await act(async () =>
    polls[1].resolve({
      receiptId: 1,
      body: {
        typeWebhook: 'incomingMessageReceived',
        idMessage: 'in-1',
        timestamp: 1_700_000_000,
        senderData: { chatId: '10000000', chatName: 'Alice' },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'hi back' } },
      },
    }),
  )
  expect(await within(log).findByText('hi back')).toBeVisible()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(within(log).getByText('hello there')).toBeVisible()
  expect(composer).toHaveValue('still typing')

  // Changing credentials ends the session locally and leaves nothing of it behind.
  fireEvent.click(screen.getByRole('button', { name: 'Change credentials' }))
  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible()
  expect(document.body.innerHTML).not.toContain(token)
})
