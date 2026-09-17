import { normalizePhone } from '../../shared/lib/phone'
import { insertMessage, mapNotification } from './conversation'
import type { Chat, MappedNotification, Message } from './conversation'

function incoming(
  messageData: unknown,
  sender: Record<string, unknown> = {},
  envelope: Record<string, unknown> = {},
) {
  return {
    typeWebhook: 'incomingMessageReceived',
    timestamp: 1763115112,
    idMessage: '1763115112345',
    senderData: { chatId: '10000000', chatName: 'Ivan Petrov', chatType: 'user', ...sender },
    messageData,
    ...envelope,
  }
}

const text = { typeMessage: 'textMessage', textMessageData: { textMessage: 'Hello' } }
const extended = {
  typeMessage: 'extendedTextMessage',
  extendedTextMessageData: { text: 'Hello https://green-api.com/', title: 'GREEN-API' },
}
const message = (patch: Partial<Message> = {}): MappedNotification => ({
  type: 'message',
  chatId: '10000000',
  chatName: 'Ivan Petrov',
  message: { id: '1763115112345', text: 'Hello', outgoing: false, timestamp: 1763115112000, ...patch },
})

test.each<[string, string, string | null]>([
  ['plain Russian number', '79991234567', '79991234567'],
  ['formatted Russian number', '+7 (999) 123-45-67', '79991234567'],
  ['plain Belarusian number', '375291234567', '375291234567'],
  ['formatted Belarusian number', '+375 (29) 123-45-67', '375291234567'],
  ['national prefix without a country code', '89991234567', null],
  ['ten digits', '7999123456', null],
  ['thirteen digits', '7999123456789', null],
  ['unsupported country code', '19991234567', null],
  ['alphabetic input', '+7999abc4567', null],
  ['arbitrary punctuation', '7999*123*4567', null],
  ['empty input', '   ', null],
])('normalizes a %s', (_name, input, expected) => {
  expect(normalizePhone(input)).toBe(expected)
})

test.each<[string, unknown, MappedNotification]>([
  ['incoming text message', incoming(text), message()],
  ['incoming extended text message', incoming(extended), message({ text: 'Hello https://green-api.com/' })],
  [
    'outgoing API echo',
    incoming(text, {}, { typeWebhook: 'outgoingAPIMessageReceived' }),
    { ...message({ outgoing: true }) },
  ],
  [
    'outgoing echo of an extended text message',
    incoming(extended, {}, { typeWebhook: 'outgoingAPIMessageReceived' }),
    message({ text: 'Hello https://green-api.com/', outgoing: true }),
  ],
  [
    'message with an infinite timestamp',
    incoming(text, {}, { timestamp: 1e400 }),
    message({ timestamp: expect.any(Number) as unknown as number }),
  ],
  [
    'message without a server timestamp',
    incoming(text, {}, { timestamp: undefined }),
    message({ timestamp: expect.any(Number) as unknown as number }),
  ],
  ['group chat by negative chat ID', incoming(text, { chatId: '-69876543210123' }), { type: 'discard', reason: 'unsupportedChat' }],
  ['group chat by chat type', incoming(text, { chatType: 'group' }), { type: 'discard', reason: 'unsupportedChat' }],
  ['unsupported message type', incoming({ typeMessage: 'imageMessage' }), { type: 'discard', reason: 'unsupportedType' }],
  ['unsupported webhook type', { typeWebhook: 'stateInstanceChanged', stateInstance: 'authorized' }, { type: 'discard', reason: 'unsupportedType' }],
  ['text payload without text', incoming({ typeMessage: 'textMessage', textMessageData: {} }), { type: 'discard', reason: 'malformed' }],
  ['message without an ID', incoming(text, {}, { idMessage: undefined }), { type: 'discard', reason: 'malformed' }],
  ['message without a chat ID', incoming(text, { chatId: '' }), { type: 'discard', reason: 'malformed' }],
  ['envelope without a webhook type', incoming(text, {}, { typeWebhook: undefined }), { type: 'discard', reason: 'malformed' }],
  ['envelope without sender data', incoming(text, {}, { senderData: undefined }), { type: 'discard', reason: 'malformed' }],
  ['envelope with non-object message data', incoming('Hello'), { type: 'discard', reason: 'malformed' }],
  ['message with an empty ID', incoming(text, {}, { idMessage: '' }), { type: 'discard', reason: 'malformed' }],
  ['body that is not an object', 'incomingMessageReceived', { type: 'discard', reason: 'malformed' }],
  ['missing body', null, { type: 'discard', reason: 'malformed' }],
])('maps a %s', (_name, body, expected) => {
  expect(mapNotification(body)).toEqual(expected)
})

test('inserts chats and messages idempotently, preserving arrival order', () => {
  const first: Message = { id: 'a', text: 'first', outgoing: false, timestamp: 1 }
  const second: Message = { id: 'b', text: 'second', outgoing: true, timestamp: 2 }
  const empty: Chat[] = []

  const created = insertMessage(empty, '10000000', first, 'Ivan Petrov')
  expect(created).toEqual([{ id: '10000000', name: 'Ivan Petrov', messages: [first] }])

  const appended = insertMessage(created, '10000000', second)
  expect(appended[0].messages).toEqual([first, second])

  // A repeated delivery of the same message changes nothing.
  expect(insertMessage(appended, '10000000', { ...second, text: 'echo' })).toBe(appended)

  const other = insertMessage(appended, '10000001', first)
  expect(other.map((chat) => chat.id)).toEqual(['10000000', '10000001'])
  expect(other[0].messages).toEqual([first, second])
  expect(other[1]).toEqual({ id: '10000001', name: '10000001', messages: [first] })
  expect(created[0].messages).toEqual([first])
})
