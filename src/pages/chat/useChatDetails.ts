import { useState } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { mergeHistory } from '../../entities/conversation/conversation'
import { useSession } from '../../entities/session/session'
import { getChatHistory, getContactInfo } from '../../shared/api/greenApi'

const PAGE_SIZE = 100
// MAX exposes up to 5000 messages from the last three months.
const HISTORY_LIMIT = 5000

/** Queries use the session QueryClient, so logout clears and aborts them together. */
export function useChatDetails(chatId: string | null) {
  const session = useSession()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const count = chatId ? counts[chatId] ?? PAGE_SIZE : PAGE_SIZE
  const history = useQuery({
    queryKey: ['history', chatId, count],
    queryFn: chatId ? async ({ signal }) => {
      const data = await getChatHistory(session.credentials, chatId, count, signal)
      if (!signal.aborted) session.updateChats((chats) => mergeHistory(chats, chatId, data))
      return data.length
    } : skipToken,
  })
  const contact = useQuery({
    queryKey: ['contact', chatId],
    queryFn: chatId ? async ({ signal }) => {
      const data = await getContactInfo(session.credentials, chatId, signal)
      if (!signal.aborted) session.updateChats((chats) => chats.map((chat) => chat.id === chatId
        ? { ...chat, name: data.name || chat.name, avatarUrl: data.avatarUrl }
        : chat))
      return data
    } : skipToken,
  })
  const hasMore = history.data !== undefined && history.data >= count && count < HISTORY_LIMIT

  return {
    loading: history.isFetching,
    error: history.isError ? 'Не удалось загрузить историю сообщений.' : null,
    contactError: contact.isError ? 'Не удалось загрузить имя и фото контакта.' : null,
    hasMore,
    retry: () => {
      if (!chatId || !session.isActive()) return
      if (history.isError) void history.refetch()
      if (contact.isError) void contact.refetch()
    },
    loadMore: () => {
      if (!chatId || !hasMore || history.isFetching || !session.isActive()) return
      setCounts((current) => ({ ...current, [chatId]: Math.min(count + PAGE_SIZE, HISTORY_LIMIT) }))
    },
  }
}
