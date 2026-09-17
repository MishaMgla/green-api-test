import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useReceiveLoop } from './useReceiveLoop'
import { chatsKey, createSession, SessionContext, type Session } from '../../entities/session/session'
import type { Chat } from '../../entities/conversation/conversation'
import type { Credentials } from '../../shared/api/greenApi'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
}

const ALICE = '10000000'

type Call = {
  url: string
  method: string
  aborted: boolean
  /** True once the request produced any outcome: answered, failed, or aborted. */
  settled: boolean
  /** Answers 200 with this JSON body. */
  resolve: (body: unknown) => void
  /** Answers an HTTP failure status. */
  fail: (status: number, body?: string) => void
  /** Fails the request the way a lost connection does: no response at all. */
  lose: () => void
}

/**
 * Hand-controlled fetch: the loop is serial, so at most one call is ever in flight.
 * `honourAbort: false` keeps a cancelled request answerable, so a completion that
 * outlives its owner really does arrive.
 */
function stubFetch(honourAbort = true): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const call: Call = {
        url,
        method: init?.method ?? 'GET',
        aborted: false,
        settled: false,
        resolve: (body) => {
          call.settled = true
          resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) })
        },
        fail: (status, body = '') => {
          call.settled = true
          resolve({ ok: false, status, text: async () => body })
        },
        lose: () => {
          call.settled = true
          reject(new TypeError('Failed to fetch'))
        },
      }
      init?.signal?.addEventListener('abort', () => {
        call.aborted = true
        if (honourAbort) {
          call.settled = true
          reject(new DOMException('Aborted', 'AbortError'))
        }
      })
      calls.push(call)
    })
  })
  return calls
}

/**
 * Advances fake time and lets every queued promise land. The chat cache notifies its
 * observer on a zero-delay timer, so without this the assertion could read a screen
 * and a cache that the loop has not finished updating.
 */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Renders the single owner; its button shows the reported state and triggers a retry. */
function Owner() {
  const { state, retry } = useReceiveLoop()
  return (
    <button type="button" onClick={retry}>
      {state.status === 'polling' ? 'polling' : `${state.status}:${state.kind}`}
    </button>
  )
}

const shows = (text: string) => expect(screen.getByRole('button')).toHaveTextContent(text)

function Harness({ session }: { session: Session }) {
  return (
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <Owner />
      </SessionContext.Provider>
    </QueryClientProvider>
  )
}

/** StrictMode has to sit at the top of the rendered tree, as it does in `main.tsx`. */
const tree = (session: Session, strict: boolean): ReactNode =>
  strict ? <StrictMode><Harness session={session} /></StrictMode> : <Harness session={session} />

async function mount(strict = false) {
  const session = createSession(CREDENTIALS)
  const view = render(tree(session, strict))
  await settle()
  return { session, view }
}

const incoming = (idMessage: string, text = 'hello', chatId = ALICE) => ({
  typeWebhook: 'incomingMessageReceived',
  idMessage,
  timestamp: 1_700_000_000,
  senderData: { chatId, chatName: 'Alice' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
})

const receives = (calls: Call[]) => calls.filter((call) => call.url.includes('/receiveNotification/'))
const deletes = (calls: Call[]) => calls.filter((call) => call.url.includes('/deleteNotification/'))
/** Requests still in flight: exactly one of these means exactly one live owner. */
const live = (calls: Call[]) => calls.filter((call) => !call.settled)
const last = (calls: Call[]) => calls[calls.length - 1]

const texts = (session: Session) =>
  (session.queryClient.getQueryData<Chat[]>(chatsKey) ?? []).flatMap((chat) =>
    chat.messages.map((message) => message.text),
  )

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('an empty queue starts the next cycle at once, with no acknowledgement', async () => {
  const calls = stubFetch()
  await mount()

  expect(receives(calls)).toHaveLength(1)
  // `null` is the empty body; `{}` is the empty object the provider also answers with.
  last(calls).resolve(null)
  await settle()
  expect(receives(calls)).toHaveLength(2)

  last(calls).resolve({})
  await settle()
  expect(receives(calls)).toHaveLength(3)
  expect(deletes(calls)).toHaveLength(0)
  // Nothing waits between cycles: no backoff timer was armed.
  expect(live(calls)).toHaveLength(1)
})

test('a text message is merged before its receipt is acknowledged', async () => {
  const calls = stubFetch()
  const { session } = await mount()

  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()

  // The acknowledgement is in flight and the message is already recorded.
  expect(texts(session)).toEqual(['hello'])
  expect(last(calls).method).toBe('DELETE')
  expect(last(calls).url).toContain('/deleteNotification/')
  expect(last(calls).url).toMatch(/\/7$/)
  const chats = session.queryClient.getQueryData<Chat[]>(chatsKey) ?? []
  expect(chats.map((chat) => [chat.id, chat.name])).toEqual([[ALICE, 'Alice']])

  last(calls).resolve({ result: true })
  await settle()
  expect(receives(calls)).toHaveLength(2)
})

test('a redelivered receipt is acknowledged again without duplicating the message', async () => {
  const calls = stubFetch()
  const { session } = await mount()

  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()
  last(calls).resolve({ result: true })
  await settle()

  last(calls).resolve({ receiptId: 8, body: incoming('m1') })
  await settle()
  expect(last(calls).url).toMatch(/\/8$/)
  last(calls).resolve({ result: true })
  await settle()

  expect(texts(session)).toEqual(['hello'])
  expect(deletes(calls)).toHaveLength(2)
})

test.each([
  ['an ignored type', { typeWebhook: 'outgoingMessageStatus', idMessage: 'm1' }],
  [
    'a group chat',
    {
      typeWebhook: 'incomingMessageReceived',
      idMessage: 'm1',
      senderData: { chatId: '-1234567890' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'hi' } },
    },
  ],
  ['a malformed body', { typeWebhook: 'incomingMessageReceived', senderData: null }],
])('%s is discarded and acknowledged so it cannot block the queue', async (_name, body) => {
  const calls = stubFetch()
  const { session } = await mount()

  last(calls).resolve({ receiptId: 3, body })
  await settle()

  expect(texts(session)).toEqual([])
  expect(last(calls).method).toBe('DELETE')
  last(calls).resolve({ result: true })
  await settle()
  expect(receives(calls)).toHaveLength(2)
})

test('a response without a usable receipt ID acknowledges nothing and does not spin', async () => {
  const calls = stubFetch()
  await mount()

  last(calls).resolve({ body: incoming('m1') })
  await settle()

  expect(deletes(calls)).toHaveLength(0)
  expect(receives(calls)).toHaveLength(1)
  await settle(1000)
  expect(receives(calls)).toHaveLength(2)
})

test('an unexpected processing failure leaves the receipt unacknowledged', async () => {
  const calls = stubFetch()
  const session = createSession(CREDENTIALS)
  const failing: Session = {
    ...session,
    updateChats() {
      throw new Error('merge failed')
    },
  }
  render(<Harness session={failing} />)
  await settle()

  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()

  // The message never reached the cache, so acknowledging it would lose it.
  expect(deletes(calls)).toHaveLength(0)
  await settle(1000)
  expect(receives(calls)).toHaveLength(2)
})

test('an unsuccessful acknowledgement keeps the message and backs off', async () => {
  const calls = stubFetch()
  const { session } = await mount()

  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()
  last(calls).resolve({ result: false })
  await settle()

  expect(texts(session)).toEqual(['hello'])
  expect(receives(calls)).toHaveLength(1)
  await settle(1000)
  expect(receives(calls)).toHaveLength(2)
})

test('a lost acknowledgement response lets the queue progress on redelivery', async () => {
  const calls = stubFetch()
  const { session } = await mount()

  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()
  last(calls).lose()
  await settle(1000)

  // The delete may well have succeeded, so the head is received again: either the
  // same notification comes back, or the next one does.
  expect(receives(calls)).toHaveLength(2)
  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()
  last(calls).resolve({ result: true })
  await settle()
  expect(texts(session)).toEqual(['hello'])
})

test('transient failures back off, cap, and reset after a successful cycle', async () => {
  const calls = stubFetch()
  await mount()

  // The whole ladder, then one repeat of the capped step: each delay is checked just
  // before its boundary, where the next receive must not have been issued yet.
  let issued = 1
  for (const seconds of [1, 2, 4, 8, 16, 30, 30]) {
    last(calls).fail(500)
    await settle(seconds * 1000 - 1)
    expect(receives(calls)).toHaveLength(issued)
    await settle(1)
    issued += 1
    expect(receives(calls)).toHaveLength(issued)
  }

  // A successful cycle resets the delay to its first step.
  last(calls).resolve(null)
  await settle()
  expect(receives(calls)).toHaveLength(issued + 1)
  last(calls).fail(500)
  await settle(999)
  expect(receives(calls)).toHaveLength(issued + 1)
  await settle(1)
  expect(receives(calls)).toHaveLength(issued + 2)
})

test('a restarting instance backs off and resumes on its own', async () => {
  const calls = stubFetch()
  await mount()

  last(calls).fail(400, '{"message":"instance in starting process try later"}')
  await settle()
  // The provider resolves this itself, so the wait is reported but no action is asked for.
  shows('retrying:instanceStarting')
  await settle(999)
  expect(receives(calls)).toHaveLength(1)
  await settle(1)
  expect(receives(calls)).toHaveLength(2)
  expect(live(calls)).toHaveLength(1)

  // Contrast: a credentials failure on the same loop still pauses it.
  last(calls).fail(401)
  await settle(60_000)
  shows('paused:unauthorized')
  expect(receives(calls)).toHaveLength(2)
})

test('an authentication failure pauses the owner until the same owner is retried', async () => {
  const calls = stubFetch()
  await mount()

  last(calls).fail(401)
  await settle()
  shows('paused:unauthorized')

  // A paused loop spins on nothing, however long it is left alone.
  await settle(60_000)
  expect(receives(calls)).toHaveLength(1)

  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
    await vi.advanceTimersByTimeAsync(0)
  })
  shows('polling')
  // Resumed, not restarted: one more receive and no second live request.
  expect(receives(calls)).toHaveLength(2)
  expect(live(calls)).toHaveLength(1)

  last(calls).resolve(null)
  await settle()
  expect(receives(calls)).toHaveLength(3)
  expect(live(calls)).toHaveLength(1)
})

test('a receive that lands after the session ended acknowledges nothing', async () => {
  const calls = stubFetch(false)
  const { session } = await mount()

  session.end()
  // The request was cancelled but answers anyway, as a lost race really would.
  last(calls).resolve({ receiptId: 7, body: incoming('m1') })
  await settle()

  expect(deletes(calls)).toHaveLength(0)
  expect(texts(session)).toEqual([])
  expect(receives(calls)).toHaveLength(1)
})

test('a StrictMode mount, cleanup and remount leave exactly one live owner', async () => {
  const calls = stubFetch()
  const { session, view } = await mount(true)

  // The development double mount: the first owner's request is aborted, not orphaned.
  expect(calls).toHaveLength(2)
  expect(calls[0].aborted).toBe(true)
  expect(live(calls)).toHaveLength(1)

  view.unmount()
  await settle()
  expect(live(calls)).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)

  const remounted = render(tree(session, true))
  await settle()
  expect(live(calls)).toHaveLength(1)

  remounted.unmount()
  await settle()
  expect(live(calls)).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)
})

test('changing credentials replaces the owner instead of adding one', async () => {
  const calls = stubFetch()
  const first = createSession(CREDENTIALS)
  const view = render(<Harness session={first} />)
  await settle()

  // A backoff is pending when the session is replaced: its timer must go too.
  last(calls).fail(500)
  await settle()
  expect(vi.getTimerCount()).toBe(1)

  first.end()
  const second = createSession({ ...CREDENTIALS, idInstance: '1101000002' })
  view.rerender(<Harness session={second} />)
  await settle()

  expect(live(calls)).toHaveLength(1)
  expect(last(calls).url).toContain('waInstance1101000002')
  expect(vi.getTimerCount()).toBe(1) // only the new request's deadline

  view.unmount()
  await settle()
  expect(live(calls)).toHaveLength(0)
  expect(vi.getTimerCount()).toBe(0)
})

test('a transient failure reports the wait and clears it on the next successful cycle', async () => {
  const calls = stubFetch()
  await mount()

  shows('polling')
  last(calls).fail(500)
  await settle()
  // The first failure is reported: a network outage must not back off silently.
  shows('retrying:transport')

  await settle(1000)
  expect(receives(calls)).toHaveLength(2)
  // Still retrying while the replacement request is in flight; only an outcome clears it.
  shows('retrying:transport')

  last(calls).resolve(null)
  await settle()
  shows('polling')
})

test('a replacement session polls instead of inheriting the paused failure', async () => {
  const calls = stubFetch()
  const first = createSession(CREDENTIALS)
  const view = render(<Harness session={first} />)
  await settle()

  last(calls).fail(401)
  await settle()
  shows('paused:unauthorized')

  first.end()
  const second = createSession({ ...CREDENTIALS, idInstance: '1101000002' })
  view.rerender(<Harness session={second} />)
  await settle()

  shows('polling')
  expect(live(calls)).toHaveLength(1)
})

test('a tab focus or reconnect event does not start another owner', async () => {
  const calls = stubFetch()
  await mount()

  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(receives(calls)).toHaveLength(1)
  expect(live(calls)).toHaveLength(1)
})
