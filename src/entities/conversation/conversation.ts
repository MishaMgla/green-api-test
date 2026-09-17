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
  avatarUrl?: string
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

  // An outgoing echo's sender is our own account, not the recipient.
  const names = outgoing ? [sender.chatName] : [sender.senderContactName, sender.chatName, sender.senderName]
  const chatName = names
    .find((name): name is string => typeof name === 'string' && name.trim() !== '') ?? chatId
  // An infinite or absent timestamp falls back to arrival time; it never drops a message.
  const seconds = envelope.timestamp
  const fromServer = Number.isFinite(seconds)
  const timestamp = fromServer ? (seconds as number) * 1000 : Date.now()
  return { type: 'message', chatId, chatName, message: { id, text, outgoing, timestamp, fromServer } }
}

/**
 * Inserts a message into the chats cache, creating the chat when needed.
 * Idempotent on chat ID + message ID and ordered by timestamp; returns the
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
  const messages = mergeMessages(chat.messages, [message])
  const name = chatName !== chatId ? chatName : chat.name
  if (messages === chat.messages && name === chat.name) return chats
  const updated = { ...chat, name, messages }
  return chats.map((existing, position) => (position === index ? updated : existing))
}

/** The same merge handles late history, received messages, and send echoes. */
function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const messages = new Map(existing.map((message) => [message.id, message]))
  let changed = false
  for (const message of incoming) {
    const known = messages.get(message.id)
    if (!known || (message.fromServer && !known.fromServer)) {
      messages.set(message.id, known ? { ...known, timestamp: message.timestamp, fromServer: true } : message)
      changed = true
    }
  }
  return changed ? [...messages.values()].sort((a, b) => a.timestamp - b.timestamp) : existing
}

/** Validates the flat MAX history format through the notification mapper. */
export function mergeHistory(chats: Chat[], chatId: string, history: unknown[]): Chat[] {
  const messages: Message[] = []
  let chatName: string | undefined
  for (const item of history) {
    const record = asRecord(item)
    if (!record || record.chatId !== chatId || !['incoming', 'outgoing'].includes(String(record.type))) continue
    const mapped = mapNotification({
      ...record,
      typeWebhook: record.type === 'outgoing' ? 'outgoingAPIMessageReceived' : 'incomingMessageReceived',
      senderData: { ...record, chatName: record.senderContactName || record.senderName },
      messageData: {
        typeMessage: record.typeMessage,
        textMessageData: { textMessage: record.textMessage },
        extendedTextMessageData: { text: record.textMessage ?? asRecord(record.extendedTextMessage)?.text },
      },
    })
    if (mapped.type !== 'message') continue
    messages.push(mapped.message)
    if (!mapped.message.outgoing && mapped.chatName !== chatId) chatName ??= mapped.chatName
  }
  return chats.map((chat) => chat.id === chatId ? {
    ...chat,
    name: chat.name === chatId ? chatName ?? chat.name : chat.name,
    messages: mergeMessages(chat.messages, messages),
  } : chat)
}
