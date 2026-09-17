import { asRecord } from '../../shared/lib/record'

export type Message = {
  /** Provider message ID, kept as a string; unique within its chat. */
  id: string
  text: string
  outgoing: boolean
  /** Milliseconds since the epoch: the server timestamp when it is available. */
  timestamp: number
  /** True when `timestamp` came from the provider rather than the local clock. */
  fromServer?: boolean
}

export type Chat = {
  /** Canonical provider chat ID, kept as a string. */
  id: string
  name: string
  messages: Message[]
}

export type MappedNotification =
  | { type: 'message'; chatId: string; chatName: string; message: Message }
  /** Nothing to show. The receipt is already validated, so the body can be dropped. */
  | { type: 'discard'; reason: 'unsupportedType' | 'unsupportedChat' | 'malformed' }

const DISCARD_TYPE = { type: 'discard', reason: 'unsupportedType' } as const
const DISCARD_CHAT = { type: 'discard', reason: 'unsupportedChat' } as const
const MALFORMED = { type: 'discard', reason: 'malformed' } as const

/**
 * Maps an incoming or outgoing-echo notification body to a message.
 * Group chats, unsupported message types and unusable bodies are discarded.
 * Acknowledging a discarded notification is the receive loop's decision.
 */
export function mapNotification(body: unknown): MappedNotification {
  const envelope = asRecord(body)
  if (!envelope) return MALFORMED

  const outgoing = envelope.typeWebhook === 'outgoingAPIMessageReceived'
  if (!outgoing && envelope.typeWebhook !== 'incomingMessageReceived') {
    return typeof envelope.typeWebhook === 'string' ? DISCARD_TYPE : MALFORMED
  }

  const sender = asRecord(envelope.senderData)
  const chatId = sender?.chatId
  if (!sender || typeof chatId !== 'string' || chatId === '') return MALFORMED
  // Negative IDs are group chats; any chat type other than `user` is not direct.
  if (chatId.startsWith('-') || (sender.chatType ?? 'user') !== 'user') return DISCARD_CHAT

  const messageData = asRecord(envelope.messageData)
  if (!messageData) return MALFORMED
  let text: unknown
  if (messageData.typeMessage === 'textMessage') {
    text = asRecord(messageData.textMessageData)?.textMessage
  } else if (messageData.typeMessage === 'extendedTextMessage') {
    text = asRecord(messageData.extendedTextMessageData)?.text
  } else {
    return typeof messageData.typeMessage === 'string' ? DISCARD_TYPE : MALFORMED
  }
  if (typeof text !== 'string') return MALFORMED

  const id = envelope.idMessage
  if (typeof id !== 'string' || id === '') return MALFORMED

  const chatName = typeof sender.chatName === 'string' && sender.chatName !== '' ? sender.chatName : chatId
  // An infinite or absent timestamp falls back to arrival time; it never drops a message.
  const seconds = envelope.timestamp
  const fromServer = Number.isFinite(seconds)
  const timestamp = fromServer ? (seconds as number) * 1000 : Date.now()
  return { type: 'message', chatId, chatName, message: { id, text, outgoing, timestamp, fromServer } }
}

/**
 * Inserts a message into the chats cache, creating the chat when needed.
 * Idempotent on chat ID + message ID and preserving arrival order; returns the
 * same array when the message is already known and carries nothing new. Shared
 * by send and receive.
 */
export function insertMessage(
  chats: Chat[],
  chatId: string,
  message: Message,
  chatName = chatId,
): Chat[] {
  const index = chats.findIndex((chat) => chat.id === chatId)
  if (index === -1) return [...chats, { id: chatId, name: chatName, messages: [message] }]
  const chat = chats[index]
  const known = chat.messages.find((existing) => existing.id === message.id)
  let messages: Message[]
  if (!known) {
    messages = [...chat.messages, message]
  } else if (message.fromServer && !known.fromServer) {
    // The send response and the provider's echo are the same message. Only the echo
    // carries the server timestamp, so it replaces the local one whichever way round
    // the two arrive, in place and without a second message.
    messages = chat.messages.map((existing) =>
      existing === known ? { ...known, timestamp: message.timestamp, fromServer: true } : existing,
    )
  } else {
    return chats
  }
  const updated = { ...chat, messages }
  return chats.map((existing, position) => (position === index ? updated : existing))
}
