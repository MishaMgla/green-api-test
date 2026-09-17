import { GreenApiError, type GreenApiErrorKind } from '../../shared/api/greenApi'

/** The lookup itself succeeded, but the number has no MAX account. */
export class NoAccountError extends Error {
  constructor() {
    super('No MAX account for this number')
    this.name = 'NoAccountError'
  }
}

const UNKNOWN = 'Не удалось проверить номер. Попробуйте ещё раз.'

const BY_KIND: Partial<Record<GreenApiErrorKind, string>> = {
  cancelled: 'Проверка номера отменена.',
  unauthorized: 'Инстанс отклонил данные входа. Измените их и попробуйте ещё раз.',
  suspended: 'Аккаунт GREEN-API заблокирован. Проверьте его статус в личном кабинете.',
  instanceUnavailable: 'Инстанс не готов. Авторизуйте его в личном кабинете и попробуйте ещё раз.',
  instanceStarting: 'Инстанс перезапускается. Подождите несколько секунд и попробуйте ещё раз.',
  quotaExceeded: 'Лимит тарифа исчерпан. Смените тариф или продолжите существующий чат.',
  rateLimited: 'Слишком много запросов к инстансу. Подождите несколько секунд и попробуйте ещё раз.',
  lookupLimited:
    'Проверка номеров для этого инстанса ограничена. Подождите около двух часов перед проверкой следующего номера.',
}

/** Actionable, credential-free text for a failed lookup. */
export function lookupErrorMessage(failure: unknown): string {
  if (failure instanceof NoAccountError) return 'Для этого номера нет аккаунта MAX.'
  if (failure instanceof GreenApiError) return BY_KIND[failure.kind] ?? UNKNOWN
  return UNKNOWN
}
