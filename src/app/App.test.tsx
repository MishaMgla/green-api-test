import { act, fireEvent, render, screen } from '@testing-library/react'
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

/** Replaces fetch with a hand-controlled queue; no request ever leaves the test. */
function stubFetch(honourAbort = true) {
  const pending: Pending[] = []
  // The chat page owns the receive loop, whose long poll is not what these tests
  // drive. It is answered by a promise that never settles and counted separately,
  // so the hand-controlled queue keeps holding only the requests under test.
  const receiveMock = vi.fn(() => new Promise(() => {}))
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
  return { fetchMock, receiveMock, pending }
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
  ['a malformed instance ID', { idInstance: '110100' }],
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
