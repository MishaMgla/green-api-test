import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { CreateChatForm } from './CreateChatForm'
import { createSession, SessionContext, useChats, type Session } from '../../entities/session/session'
import { insertMessage } from '../../entities/conversation/conversation'
import type { Credentials } from '../../shared/api/greenApi'

const CREDENTIALS: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
}

type Pending = { resolve: (body: unknown) => void; fail: (status: number, body: string) => void }

/** Hand-controlled fetch queue; the abort is deliberately ignored so late results arrive. */
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

function ChatList() {
  const chats = useChats()
  return (
    <ul aria-label="Чаты">
      {chats.map((chat) => (
        <li key={chat.id}>{`${chat.id}:${chat.messages.length}`}</li>
      ))}
    </ul>
  )
}

function renderForm(session: Session) {
  const selected: string[] = []
  render(
    <QueryClientProvider client={session.queryClient}>
      <SessionContext.Provider value={session}>
        <CreateChatForm onSelect={(chatId) => selected.push(chatId)} />
        <ChatList />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
  return selected
}

async function submit(phone: string) {
  fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: phone } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }))
  })
}

const chatIds = () => screen.getAllByRole('listitem').map((item) => item.textContent)

afterEach(() => vi.unstubAllGlobals())

test('rejects an unsupported number without calling the provider', async () => {
  const { fetchMock } = stubFetch()
  renderForm(createSession(CREDENTIALS))
  await submit('+1 415 555 0100')

  expect(screen.getByRole('alert')).toHaveTextContent('российский')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Номер телефона')).toHaveValue('+1 415 555 0100')
})

test('repeated numbers and alternate formatting select one chat and one lookup', async () => {
  const { fetchMock, pending } = stubFetch()
  const selected = renderForm(createSession(CREDENTIALS))

  await submit('+7 (999) 123-45-67')
  expect(screen.getByRole('button', { name: 'Проверяем…' })).toBeDisabled()
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))

  await submit('79991234567')
  await act(async () => {})

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(chatIds()).toEqual(['10000000:0'])
  expect(selected).toEqual(['10000000', '10000000'])
})

test('a chat inserted by reception during the lookup is reused, not duplicated', async () => {
  const { pending } = stubFetch()
  const session = createSession(CREDENTIALS)
  renderForm(session)

  await submit('79991234567')
  act(() =>
    session.updateChats((chats) =>
      insertMessage(chats, '10000000', { id: 'm1', text: 'hi', outgoing: false, timestamp: 1 }),
    ),
  )
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))

  expect(chatIds()).toEqual(['10000000:1'])
})

test('a cancelled lookup cannot add a chat to another session', async () => {
  const { pending } = stubFetch()
  const session = createSession(CREDENTIALS)
  renderForm(session)

  await submit('79991234567')
  act(() => session.end())
  const replacement = createSession(CREDENTIALS)
  await act(async () => pending[0].resolve({ exist: true, chatId: '10000000' }))

  expect(screen.getByRole('list', { name: 'Чаты' })).toBeEmptyDOMElement()
  expect(replacement.queryClient.getQueryData(['chats'])).toEqual([])
})

test.each([
  [{ exist: false, chatId: '' }, 'Для этого номера нет аккаунта MAX.'],
  [{ exist: 'yes' }, 'Не удалось проверить номер. Попробуйте ещё раз.'],
])('does not create a chat from response %j', async (body, message) => {
  const { pending } = stubFetch()
  renderForm(createSession(CREDENTIALS))

  await submit('79991234567')
  await act(async () => pending[0].resolve(body))

  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('list', { name: 'Чаты' })).toBeEmptyDOMElement()
  expect(screen.getByLabelText('Номер телефона')).toHaveValue('79991234567')
})

test('a contact-lookup restriction advises pausing checks, not retrying soon', async () => {
  const { pending } = stubFetch()
  renderForm(createSession(CREDENTIALS))

  await submit('79991234567')
  await act(async () => pending[0].fail(469, 'User get contact info limit reached'))

  expect(screen.getByRole('alert')).toHaveTextContent('двух часов')
})

test('a rate limit advises waiting a few seconds', async () => {
  const { pending } = stubFetch()
  renderForm(createSession(CREDENTIALS))

  await submit('79991234567')
  await act(async () => pending[0].fail(429, ''))

  expect(screen.getByRole('alert')).toHaveTextContent('Подождите несколько секунд')
})
