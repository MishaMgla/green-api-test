import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ChatPage } from '../../pages/chat/ChatPage'
import { createSession, SessionContext, type Session } from '../../entities/session/session'
import { insertMessage, mapNotification } from '../../entities/conversation/conversation'
import type { Credentials } from '../../shared/api/greenApi'
import { MESSAGE_LIMIT } from './useSendMessage'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
  apiUrl: 'https://1101.api.green-api.com',
}

const ALICE = '10000000'
const BOB = '20000000'

type Pending = { resolve: (body: unknown) => void; fail: (status: number, body: string) => void }

/** Hand-controlled fetch queue, so a send can stay in flight while the test acts. */
function stubFetch() {
  const pending: Pending[] = []
  const fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        pending.push({
          resolve: (body) =>
            resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) }),
          fail: (status, body) => resolve({ ok: false, status, text: async () => body }),
        })
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, pending }
}

function renderPage(): Session {
  const session = createSession(CREDENTIALS)
  session.updateChats(() => [
    { id: ALICE, name: 'Alice', messages: [] },
    { id: BOB, name: 'Bob', messages: [] },
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
 * Runs one action and settles the DOM. The chat cache notifies its observer on a
 * zero-delay timer, so without this a message could still be on its way to the screen
 * while the test asserts — which would hide a duplicate instead of showing it.
 */
async function settle(action: () => void = () => {}) {
  await act(async () => {
    action()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Merges an outgoing API echo exactly as the receive loop will: same mapping, same updater. */
async function echo(session: Session, chatId: string, idMessage: string, text: string) {
  const mapped = mapNotification({
    typeWebhook: 'outgoingAPIMessageReceived',
    idMessage,
    timestamp: 1_700_000_000,
    senderData: { chatId, chatName: 'Alice' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
  })
  if (mapped.type !== 'message') throw new Error('echo fixture is not a message')
  await settle(() =>
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
const clickSend = () => settle(() => void fireEvent.click(sendButton()))
const bubbles = () => within(screen.getByRole('log')).queryAllByRole('listitem')
const bubbleTexts = () => bubbles().map((item) => item.querySelector('p')?.textContent)

afterEach(() => vi.unstubAllGlobals())

test('an accepted response adds the message once and clears that draft', async () => {
  const { fetchMock, pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  await clickSend()

  // While the send is in flight, a second submission cannot start another one.
  expect(sendButton()).toBeDisabled()
  await clickSend()
  expect(fetchMock).toHaveBeenCalledTimes(1)

  await settle(() => pending[0].resolve({ idMessage: 'm1' }))

  expect(bubbleTexts()).toEqual(['hello'])
  expect(composer()).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a failed send keeps the draft and calls delivery uncertain', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  await clickSend()
  await settle(() => pending[0].fail(500, ''))

  expect(screen.getByRole('alert')).toHaveTextContent('may or may not have been sent')
  expect(composer()).toHaveValue('hello')
  expect(bubbles()).toHaveLength(0)
})

test('a whitespace-only draft sends nothing', async () => {
  const { fetchMock } = stubFetch()
  renderPage()

  open('Alice')
  type('   \n  ')

  expect(sendButton()).toBeDisabled()
  await clickSend()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a draft over the character limit is rejected before any request', async () => {
  const { fetchMock } = stubFetch()
  renderPage()
  const long = 'a'.repeat(MESSAGE_LIMIT + 1)

  open('Alice')
  type(long)
  await clickSend()

  expect(screen.getByRole('alert')).toHaveTextContent(`at most ${MESSAGE_LIMIT} characters`)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(composer()).toHaveValue(long)
})

test('selecting another chat while a send is pending does not redirect the message', async () => {
  const { pending } = stubFetch()
  renderPage()

  open('Alice')
  type('hello')
  await clickSend()

  open('Bob')
  type('for Bob')
  await settle(() => pending[0].resolve({ idMessage: 'm1' }))

  // The accepted message belongs to the chat it was sent to, not the selected one.
  expect(bubbles()).toHaveLength(0)
  expect(composer()).toHaveValue('for Bob')

  open('Alice')
  expect(bubbleTexts()).toEqual(['hello'])
  expect(composer()).toHaveValue('')
})

test('the response and its API echo produce one message, response first', async () => {
  const { pending } = stubFetch()
  const session = renderPage()

  open('Alice')
  type('hello')
  await clickSend()
  await settle(() => pending[0].resolve({ idMessage: 'm1' }))
  await echo(session, ALICE, 'm1', 'hello')

  expect(bubbleTexts()).toEqual(['hello'])
})

test('the response and its API echo produce one message, echo first', async () => {
  const { pending } = stubFetch()
  const session = renderPage()

  open('Alice')
  type('hello')
  await clickSend()
  await echo(session, ALICE, 'm1', 'hello')
  await settle(() => pending[0].resolve({ idMessage: 'm1' }))

  expect(bubbleTexts()).toEqual(['hello'])
  expect(composer()).toHaveValue('')
})
