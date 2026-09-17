import { GreenApiError, checkAccount, deleteNotification, getChatHistory, getContactInfo, receiveNotification, sendMessage } from './greenApi'
import type { Credentials, GreenApiErrorKind } from './greenApi'

const credentials: Credentials = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
}
const base = 'https://3100.api.green-api.com/waInstance1101000001'
const token = '%3CapiTokenInstance%3E'

const fetchMock = vi.fn()

function reply(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body }
}

function respondWith(body: string, status = 200) {
  fetchMock.mockResolvedValue(reply(body, status))
}

async function kindOf(call: Promise<unknown>): Promise<GreenApiErrorKind> {
  try {
    await call
  } catch (error) {
    if (!(error instanceof GreenApiError)) throw error
    // No credential or provider detail may leak into what we may display.
    expect(error.message).not.toContain(credentials.apiTokenInstance)
    expect(error.message).not.toContain('https://3100.api.green-api.com')
    return error.kind
  }
  throw new Error('expected a GreenApiError')
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('builds each request on the fixed API origin with encoded runtime credentials', async () => {
  const signal = new AbortController().signal

  respondWith('{"exist":true,"chatId":"10000000","fromCache":false}')
  await expect(checkAccount(credentials, '79991234567', signal)).resolves.toEqual({
    exist: true,
    chatId: '10000000',
  })
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${base}/checkAccount/${token}`,
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"phoneNumber":79991234567}',
    }),
  )

  respondWith('{"idMessage":"1763115112345"}')
  await expect(sendMessage(credentials, '10000000', 'Hello', signal)).resolves.toBe('1763115112345')
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${base}/sendMessage/${token}`,
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"chatId":"10000000","message":"Hello"}',
    }),
  )

  respondWith('{"receiptId":1234567,"body":{"typeWebhook":"incomingMessageReceived"}}')
  await expect(receiveNotification(credentials, signal)).resolves.toEqual({
    receiptId: 1234567,
    body: { typeWebhook: 'incomingMessageReceived' },
  })
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${base}/receiveNotification/${token}?receiveTimeout=20`,
    expect.objectContaining({ method: 'GET' }),
  )

  respondWith('{"result":true}')
  await expect(deleteNotification(credentials, 1234567, signal)).resolves.toBeUndefined()
  expect(fetchMock).toHaveBeenLastCalledWith(
    `${base}/deleteNotification/${token}/1234567`,
    expect.objectContaining({ method: 'DELETE' }),
  )
})

test('requests MAX history by count and gets the name and avatar in one contact lookup', async () => {
  const signal = new AbortController().signal
  respondWith('[]')
  await expect(getChatHistory(credentials, '10000000', 200, signal)).resolves.toEqual([])
  expect(fetchMock).toHaveBeenLastCalledWith(`${base}/getChatHistory/${token}`, expect.objectContaining({
    method: 'POST', body: '{"chatId":"10000000","count":200}',
  }))
  respondWith(JSON.stringify({ chatId: '10000000', chatType: 'user', name: 'Profile', contactName: 'Saved name', avatar: 'https://i.oneme.ru/photo' }))
  await expect(getContactInfo(credentials, '10000000', signal)).resolves.toEqual({ name: 'Saved name', avatarUrl: 'https://i.oneme.ru/photo' })
  expect(fetchMock).toHaveBeenLastCalledWith(`${base}/getContactInfo/${token}`, expect.objectContaining({
    method: 'POST', body: '{"chatId":"10000000"}',
  }))
  respondWith('{}')
  await expect(kindOf(getChatHistory(credentials, '10000000', 100, signal))).resolves.toBe('transport')
  await expect(kindOf(getContactInfo(credentials, '10000000', signal))).resolves.toBe('transport')
  respondWith(JSON.stringify({ chatId: '10000000', chatType: 'user', name: 'Profile', contactName: '', avatar: 'javascript:alert(1)' }))
  await expect(getContactInfo(credentials, '10000000', signal)).resolves.toEqual({ name: 'Profile', avatarUrl: '' })
})

test.each([
  ['empty body', ''],
  ['literal null', 'null'],
  ['empty object', '{}'],
])('resolves an empty receive (%s) to null', async (_name, body) => {
  respondWith(body)
  await expect(receiveNotification(credentials, new AbortController().signal)).resolves.toBeNull()
})

test.each<[string, () => Promise<unknown>, string, GreenApiErrorKind]>([
  ['lookup without exist', () => checkAccount(credentials, '79991234567', new AbortController().signal), '{"chatId":"10000000"}', 'transport'],
  ['lookup of an existing account without a chat ID', () => checkAccount(credentials, '79991234567', new AbortController().signal), '{"exist":true,"chatId":""}', 'transport'],
  ['lookup on a starting instance', () => checkAccount(credentials, '79991234567', new AbortController().signal), '{"status":false,"reason":"instance is starting or not authorized"}', 'instanceUnavailable'],
  ['lookup past the contact-info limit', () => checkAccount(credentials, '79991234567', new AbortController().signal), '{"status":false,"reason":"User get contact info limit reached"}', 'lookupLimited'],
  ['send without idMessage', () => sendMessage(credentials, '10000000', 'Hello', new AbortController().signal), '{"idMessage":1763115112345}', 'transport'],
  ['send with an empty idMessage', () => sendMessage(credentials, '10000000', 'Hello', new AbortController().signal), '{"idMessage":""}', 'transport'],
  ['receive without receiptId', () => receiveNotification(credentials, new AbortController().signal), '{"body":{}}', 'transport'],
  ['receive with a fractional receiptId', () => receiveNotification(credentials, new AbortController().signal), '{"receiptId":1.5,"body":{}}', 'transport'],
  ['receive with an infinite receiptId', () => receiveNotification(credentials, new AbortController().signal), '{"receiptId":1e400,"body":{}}', 'transport'],
  ['receive with an unsafe receiptId', () => receiveNotification(credentials, new AbortController().signal), '{"receiptId":9007199254740993,"body":{}}', 'transport'],
  ['receive of invalid JSON', () => receiveNotification(credentials, new AbortController().signal), 'not json', 'transport'],
  ['unsuccessful acknowledgement', () => deleteNotification(credentials, 1, new AbortController().signal), '{"result":false}', 'notAcknowledged'],
  ['acknowledgement without result', () => deleteNotification(credentials, 1, new AbortController().signal), '{}', 'transport'],
])('rejects %s', async (_name, call, body, kind) => {
  respondWith(body)
  await expect(kindOf(call())).resolves.toBe(kind)
})

test.each<[number, string, GreenApiErrorKind]>([
  [401, 'Unauthorized', 'unauthorized'],
  [403, 'Forbidden', 'unauthorized'],
  [403, 'Your account is suspended', 'suspended'],
  // Both bodies contain "starting"; only the first one resolves without the console.
  [400, 'instance in starting process try later', 'instanceStarting'],
  [400, 'instance is starting or not authorized', 'instanceUnavailable'],
  [400, 'Message cannot be received because custom webhook url is set', 'instanceUnavailable'],
  [400, 'bad request data', 'transport'],
  [429, '', 'rateLimited'],
  [469, 'User get contact info limit reached', 'lookupLimited'],
  [466, '{"invokeStatus":{"status":"QUOTE_EXCEEDED"}}', 'quotaExceeded'],
  [502, 'Bad Gateway', 'transport'],
])('maps HTTP %i to an error kind', async (status, body, kind) => {
  respondWith(body, status)
  await expect(kindOf(sendMessage(credentials, '10000000', 'Hello', new AbortController().signal))).resolves.toBe(kind)
})

test('reports cancellation separately from failure', async () => {
  const aborted = new AbortController()
  aborted.abort()
  fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
  await expect(kindOf(receiveNotification(credentials, aborted.signal))).resolves.toBe('cancelled')

  const controller = new AbortController()
  fetchMock.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  const pending = kindOf(receiveNotification(credentials, controller.signal))
  controller.abort()
  await expect(pending).resolves.toBe('cancelled')

  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(kindOf(receiveNotification(credentials, new AbortController().signal))).resolves.toBe('transport')
})

test('accepts a lookup that found no account', async () => {
  respondWith('{"exist":false,"chatId":"","fromCache":false}')
  await expect(checkAccount(credentials, '79991234567', new AbortController().signal)).resolves.toEqual({
    exist: false,
    chatId: '',
  })
})

test('reports cancellation that happens while an error body is read', async () => {
  const controller = new AbortController()
  fetchMock.mockResolvedValue({
    ok: false,
    status: 401,
    text: async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    },
  })
  await expect(kindOf(sendMessage(credentials, '10000000', 'Hello', controller.signal))).resolves.toBe('cancelled')
})

test('fails an expired deadline as transport, not cancellation', async () => {
  vi.useFakeTimers()
  try {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = kindOf(receiveNotification(credentials, new AbortController().signal))
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(pending).resolves.toBe('transport')
  } finally {
    vi.useRealTimers()
  }
})

test('releases the deadline timer and the abort listener on success and on failure', async () => {
  vi.useFakeTimers()
  try {
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')

    respondWith('{"result":true}')
    await deleteNotification(credentials, 1234567, controller.signal)
    expect(vi.getTimerCount()).toBe(0)

    respondWith('Bad Gateway', 502)
    await expect(kindOf(deleteNotification(credentials, 1234567, controller.signal))).resolves.toBe('transport')
    expect(vi.getTimerCount()).toBe(0)
    expect(removeListener).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
