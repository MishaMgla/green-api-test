import { asRecord } from '../lib/record'

/** Runtime credentials from the user's GREEN-API dashboard; never persisted. */
export type Credentials = {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export type GreenApiOperation =
  | 'checkAccount'
  | 'sendMessage'
  | 'receiveNotification'
  | 'deleteNotification'

export type GreenApiErrorKind =
  /** The caller's signal aborted the request. */
  | 'cancelled'
  /** Credentials rejected (401/403). */
  | 'unauthorized'
  /** The account is temporarily restricted by the provider. */
  | 'suspended'
  /** The instance is not authorized, expired, or still has a webhook URL. */
  | 'instanceUnavailable'
  /** The instance is restarting (400 "instance in starting process"): retry shortly. */
  | 'instanceStarting'
  /** Plan quota exceeded (466). */
  | 'quotaExceeded'
  /** Per-instance rate limit (429): retry shortly. */
  | 'rateLimited'
  /** Contact-lookup restriction: pause number checks on the instance for hours. */
  | 'lookupLimited'
  /** DeleteNotification answered `result: false`. */
  | 'notAcknowledged'
  /** Network failure, deadline, unexpected status, or unusable response body. */
  | 'transport'

/** Carries only the operation and the class of failure: no URL, token, or provider text. */
export class GreenApiError extends Error {
  readonly operation: GreenApiOperation
  readonly kind: GreenApiErrorKind

  constructor(operation: GreenApiOperation, kind: GreenApiErrorKind) {
    super(`${operation} failed: ${kind}`)
    this.name = 'GreenApiError'
    this.operation = operation
    this.kind = kind
  }
}

const REQUEST_DEADLINE_MS = 15_000
const RECEIVE_TIMEOUT_SECONDS = 20
/** Longer than the server long poll, so the server closes the wait first. */
const RECEIVE_DEADLINE_MS = 30_000

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function methodUrl(
  { apiUrl, idInstance, apiTokenInstance }: Credentials,
  method: string,
  suffix = '',
): string {
  const base = apiUrl.replace(/\/+$/, '')
  const instance = `waInstance${encodeURIComponent(idInstance)}`
  return `${base}/${instance}/${method}/${encodeURIComponent(apiTokenInstance)}${suffix}`
}

function statusKind(status: number, body: string): GreenApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return /suspend/i.test(body) ? 'suspended' : 'unauthorized'
  if (status === 429) return 'rateLimited'
  if (status === 469) return 'lookupLimited'
  if (status === 466) return 'quotaExceeded'
  if (status === 400) {
    // "in starting process" resolves itself in seconds; "starting or not authorized"
    // needs the console. Both bodies contain "starting", so the narrow one goes first.
    if (/starting process/i.test(body)) return 'instanceStarting'
    if (/not authorized|starting|webhook url|expired|deleted/i.test(body)) {
      return 'instanceUnavailable'
    }
  }
  return 'transport'
}

/**
 * Performs one request under a deadline and returns its parsed JSON, or null
 * for an empty body. Failures surface as GreenApiError.
 */
async function request(
  operation: GreenApiOperation,
  url: string,
  init: RequestInit,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<unknown> {
  // ponytail: manual signal composition; AbortSignal.any needs Safari 17.4,
  // above the browsers this build targets.
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, deadlineMs)
  signal.addEventListener('abort', abort)
  if (signal.aborted) abort()

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      // The status is classified first, so a stalled body read cannot downgrade a
      // known 401/429/466. An unreadable 403 body falls back to `unauthorized`:
      // a default when the condition is unknown, not a verdict on the credentials.
      const failure = await response.text().catch(() => '')
      throw new GreenApiError(operation, statusKind(response.status, failure))
    }
    const text = await response.text()
    if (text.trim() === '') return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new GreenApiError(operation, 'transport')
    }
  } catch (error) {
    // Cancellation wins: aborting during a body read must not look like a status failure.
    if (signal.aborted) throw new GreenApiError(operation, 'cancelled')
    if (error instanceof GreenApiError) throw error
    throw new GreenApiError(operation, 'transport')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export type Account = { exist: boolean; chatId: string }

/** Resolves a phone number (digits) to a MAX account and its canonical chat ID. */
export async function checkAccount(
  credentials: Credentials,
  phoneNumber: string,
  signal: AbortSignal,
): Promise<Account> {
  const data = await request(
    'checkAccount',
    methodUrl(credentials, 'checkAccount'),
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ phoneNumber: Number(phoneNumber) }) },
    REQUEST_DEADLINE_MS,
    signal,
  )
  const record = asRecord(data)
  if (record?.status === false) {
    const limited = typeof record.reason === 'string' && /limit reached/i.test(record.reason)
    throw new GreenApiError('checkAccount', limited ? 'lookupLimited' : 'instanceUnavailable')
  }
  if (typeof record?.exist !== 'boolean' || typeof record.chatId !== 'string') {
    throw new GreenApiError('checkAccount', 'transport')
  }
  // An existing account without a usable chat ID cannot be addressed.
  if (record.exist && record.chatId === '') throw new GreenApiError('checkAccount', 'transport')
  return { exist: record.exist, chatId: record.chatId }
}

/** Queues a text message and returns the accepted message ID. */
export async function sendMessage(
  credentials: Credentials,
  chatId: string,
  message: string,
  signal: AbortSignal,
): Promise<string> {
  const data = await request(
    'sendMessage',
    methodUrl(credentials, 'sendMessage'),
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ chatId, message }) },
    REQUEST_DEADLINE_MS,
    signal,
  )
  const idMessage = asRecord(data)?.idMessage
  // An empty ID would deduplicate unrelated messages into one.
  if (typeof idMessage !== 'string' || idMessage === '') {
    throw new GreenApiError('sendMessage', 'transport')
  }
  return idMessage
}

export type ReceivedNotification = { receiptId: number; body: unknown }

/** Long-polls one notification; resolves to null while the queue stays empty. */
export async function receiveNotification(
  credentials: Credentials,
  signal: AbortSignal,
): Promise<ReceivedNotification | null> {
  const data = await request(
    'receiveNotification',
    methodUrl(credentials, 'receiveNotification', `?receiveTimeout=${RECEIVE_TIMEOUT_SECONDS}`),
    { method: 'GET' },
    RECEIVE_DEADLINE_MS,
    signal,
  )
  if (data === null) return null
  const record = asRecord(data)
  if (record && Object.keys(record).length === 0) return null
  // Only an exact integer can be acknowledged again as the same receipt.
  if (!record || !Number.isSafeInteger(record.receiptId)) {
    throw new GreenApiError('receiveNotification', 'transport')
  }
  return { receiptId: record.receiptId as number, body: record.body }
}

/** Acknowledges a notification; `result: false` is an unsuccessful acknowledgement. */
export async function deleteNotification(
  credentials: Credentials,
  receiptId: number,
  signal: AbortSignal,
): Promise<void> {
  const data = await request(
    'deleteNotification',
    methodUrl(credentials, 'deleteNotification', `/${encodeURIComponent(receiptId)}`),
    { method: 'DELETE' },
    REQUEST_DEADLINE_MS,
    signal,
  )
  const result = asRecord(data)?.result
  if (result === false) throw new GreenApiError('deleteNotification', 'notAcknowledged')
  if (result !== true) throw new GreenApiError('deleteNotification', 'transport')
}
