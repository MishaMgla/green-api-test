import { GreenApiError, type GreenApiErrorKind } from '../../shared/api/greenApi'

/** The lookup itself succeeded, but the number has no MAX account. */
export class NoAccountError extends Error {
  constructor() {
    super('No MAX account for this number')
    this.name = 'NoAccountError'
  }
}

const UNKNOWN = 'The number could not be checked. Try again.'

const BY_KIND: Partial<Record<GreenApiErrorKind, string>> = {
  cancelled: 'The lookup was cancelled.',
  unauthorized: 'The instance rejected these credentials. Change credentials and try again.',
  suspended: 'This GREEN-API account is suspended. Check its status in the dashboard.',
  instanceUnavailable: 'The instance is not ready. Authorize it in the dashboard, then try again.',
  instanceStarting: 'The instance is restarting. Wait a few seconds and try again.',
  quotaExceeded: 'The plan quota is exhausted. Upgrade the plan or continue an existing chat.',
  rateLimited: 'Too many requests to this instance. Wait a few seconds and try again.',
  lookupLimited:
    'Number checks are restricted on this instance. Pause them for about two hours before checking another number.',
}

/** Actionable, credential-free text for a failed lookup. */
export function lookupErrorMessage(failure: unknown): string {
  if (failure instanceof NoAccountError) return 'No MAX account is registered for this number.'
  if (failure instanceof GreenApiError) return BY_KIND[failure.kind] ?? UNKNOWN
  return UNKNOWN
}
