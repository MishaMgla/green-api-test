import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { chatsKey, createSession, SessionContext } from '../../entities/session/session'
import { insertMessage, type Chat } from '../../entities/conversation/conversation'
import { useChatDetails } from './useChatDetails'

const credentials = { idInstance: '1101000001', apiTokenInstance: '<apiTokenInstance>' }
const chatId = '10000000'
const item = (idMessage: string, timestamp = 1) => ({
  chatId, type: 'incoming', typeMessage: 'textMessage', idMessage, timestamp, textMessage: idMessage, senderName: 'Иван',
})
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) })

function mount() {
  const session = createSession(credentials)
  session.updateChats(() => [{ id: chatId, name: chatId, messages: [] }])
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={session.queryClient}>
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  </QueryClientProvider>
  return { session, ...renderHook(({ selected }) => useChatDetails(selected), { wrapper, initialProps: { selected: chatId as string | null } }) }
}

afterEach(() => vi.unstubAllGlobals())

test('loads history independently of contact failure, retries contact and expands history by count', async () => {
  let contactFails = true
  const counts: number[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('/getContactInfo/')) return contactFails
      ? response({}, 500)
      : response({ chatId, chatType: 'user', name: 'Иван', contactName: 'Иван Петров', avatar: 'https://i.oneme.ru/photo' })
    const count = (JSON.parse(init.body as string) as { count: number }).count
    counts.push(count)
    return response(Array.from({ length: count === 100 ? 100 : 101 }, (_, index) => item(String(index), index + 1)))
  }))
  const { result, session } = mount()
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)?.[0].messages).toHaveLength(100)
  expect(result.current.hasMore).toBe(true)
  expect(result.current.contactError).not.toBeNull()
  expect(result.current.error).toBeNull()
  contactFails = false
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.contactError).toBeNull())
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)?.[0]).toMatchObject({ name: 'Иван Петров', avatarUrl: 'https://i.oneme.ru/photo' })
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(counts).toEqual([100, 200])
  expect(result.current.hasMore).toBe(false)
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)?.[0].messages).toHaveLength(101)
  session.end()
})

test('a late history response preserves messages received while loading', async () => {
  let finish!: (value: ReturnType<typeof response>) => void
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/getChatHistory/')
    ? new Promise((resolve) => { finish = resolve })
    : Promise.resolve(response({ chatId, chatType: 'user', name: 'Иван', contactName: '', avatar: '' }))))
  const { result, session } = mount()
  act(() => session.updateChats((chats) => insertMessage(chats, chatId, { id: 'live', text: 'live', timestamp: 3000, outgoing: false })))
  await act(async () => finish(response([item('old')])) )
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(session.queryClient.getQueryData<Chat[]>(chatsKey)?.[0].messages.map(({ id }) => id)).toEqual(['old', 'live'])
  session.end()
})

test('logout aborts both requests and ignores responses that arrive after cancellation', async () => {
  const requests: { signal: AbortSignal; finish: (body: unknown) => void }[] = []
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((resolve) => {
    requests.push({ signal: init.signal as AbortSignal, finish: (body) => resolve(response(body)) })
  })))
  const { session, unmount } = mount()
  expect(requests).toHaveLength(2)
  act(() => session.end())
  expect(requests.every(({ signal }) => signal.aborted)).toBe(true)
  await act(async () => {
    requests[0].finish([item('late')])
    requests[1].finish({ chatId, chatType: 'user', name: 'Late', contactName: '', avatar: '' })
  })
  expect(session.queryClient.getQueryData(chatsKey)).toBeUndefined()
  unmount()
})
