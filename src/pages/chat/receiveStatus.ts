import type { GreenApiErrorKind } from '../../shared/api/greenApi'
import type { ReceiveState } from './useReceiveLoop'

/** What the status strip shows: safe text, and whether correcting credentials applies. */
export type ReceiveStatus = {
  message: string
  /** True only when the instance rejected the credentials themselves. */
  changeCredentials: boolean
}

// Receiving needs its own wording rather than the lookup or send tables: the same
// failure kind asks for a different action here, where the loop is waiting rather
// than a single request having failed.
const PAUSED: Partial<Record<GreenApiErrorKind, string>> = {
  unauthorized:
    'The instance rejected these credentials, so new messages are not arriving. Change credentials to start receiving again.',
  suspended:
    'This GREEN-API account is suspended, so new messages are not arriving. Check its status in the dashboard, then retry.',
  instanceUnavailable:
    'The instance is not ready, so new messages are not arriving. Authorize it in the dashboard and clear its webhook URL, then retry.',
  quotaExceeded:
    'The plan quota is exhausted, so new messages are not arriving. Upgrade the plan, then retry.',
}

/** A pause the loop reported without a known cause still tells the user what to do. */
const PAUSED_UNKNOWN = 'New messages are not arriving. Check the instance in the dashboard, then retry.'
/** Every recoverable kind waits the same way, so no kind-specific advice is useful. */
const RETRYING = 'Reconnecting to the instance…'

/**
 * Credential-free guidance for a receive state. `null` is the normal long poll: it
 * says nothing, because a silent poll is not a condition the user has to read about.
 */
export function receiveStatus(state: ReceiveState): ReceiveStatus | null {
  if (state.status === 'polling') return null
  if (state.status === 'retrying') return { message: RETRYING, changeCredentials: false }
  return {
    message: PAUSED[state.kind] ?? PAUSED_UNKNOWN,
    changeCredentials: state.kind === 'unauthorized',
  }
}
