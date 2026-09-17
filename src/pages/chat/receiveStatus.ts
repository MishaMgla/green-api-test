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
    'Инстанс отклонил данные входа, поэтому новые сообщения не поступают. Измените данные входа, чтобы возобновить получение.',
  suspended:
    'Аккаунт GREEN-API заблокирован, поэтому новые сообщения не поступают. Проверьте его статус в личном кабинете и повторите попытку.',
  instanceUnavailable:
    'Инстанс не готов, поэтому новые сообщения не поступают. Авторизуйте его в личном кабинете, очистите адрес вебхука и повторите попытку.',
  quotaExceeded:
    'Лимит тарифа исчерпан, поэтому новые сообщения не поступают. Смените тариф и повторите попытку.',
}

/** A pause the loop reported without a known cause still tells the user what to do. */
const PAUSED_UNKNOWN = 'Новые сообщения не поступают. Проверьте инстанс в личном кабинете и повторите попытку.'
/** Show guidance only when receiving is paused and needs user action. */
export function receiveStatus(state: ReceiveState): ReceiveStatus | null {
  if (state.status !== 'paused') return null
  return {
    message: PAUSED[state.kind] ?? PAUSED_UNKNOWN,
    changeCredentials: state.kind === 'unauthorized',
  }
}
