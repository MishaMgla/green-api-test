import { createContext, useContext } from 'react'
import { QueryClient, skipToken, useQuery } from '@tanstack/react-query'
import type { Credentials } from '../../shared/api/greenApi'
import type { Chat } from '../conversation/conversation'

/** Key of the session-local chat cache. It carries no credentials, by design. */
export const chatsKey = ['chats'] as const

export type Session = {
  /** Kept in memory for the lifetime of this session only; never persisted. */
  readonly credentials: Credentials
  readonly queryClient: QueryClient
  /** Aborted when the session ends: pass it to every request the session starts. */
  readonly signal: AbortSignal
  /** Phone digits to canonical chat ID, resolved at most once per session. */
  readonly knownChatIds: Map<string, string>
  /** False once the session ended, so late completions can be discarded. */
  isActive: () => boolean
  /** Functional chat-cache update; a no-op after the session ended. */
  updateChats: (update: (chats: Chat[]) => Chat[]) => void
  /** Local logout: aborts work and drops session data. It does not log the instance out. */
  end: () => void
}

/**
 * Starts a memory-only session: fresh QueryClient, empty non-fetching chat
 * cache, one abort signal, and a guard for asynchronous completions.
 */
export function createSession(credentials: Credentials): Session {
  const controller = new AbortController()
  const knownChatIds = new Map<string, string>()
  // Session data, not server state: nothing refetches and nothing is collected
  // while the session lives, so the chats survive without any query function.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData<Chat[]>(chatsKey, [])
  let active = true

  return {
    credentials,
    queryClient,
    signal: controller.signal,
    knownChatIds,
    isActive: () => active,
    updateChats(update) {
      if (!active) return
      queryClient.setQueryData<Chat[]>(chatsKey, (chats) => update(chats ?? []))
    },
    end() {
      active = false
      controller.abort()
      queryClient.clear()
      knownChatIds.clear()
    },
  }
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('No active session')
  return session
}

/** Reads the session's chats. `skipToken` keeps the observer from ever fetching. */
export function useChats(): Chat[] {
  const { data } = useQuery<Chat[]>({ queryKey: chatsKey, queryFn: skipToken })
  return data ?? []
}
