import type { Credentials } from '../../shared/api/greenApi'

export type CredentialErrors = Partial<Record<keyof Credentials, string>>

/** Local validation only: it never contacts the provider and never probes the queue. */
export function validateCredentials(fields: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  // Length is not fixed: live instance IDs run to twelve digits and beyond.
  if (!/^\d+$/.test(fields.idInstance)) {
    errors.idInstance = 'ID инстанса — число из личного кабинета, только цифры.'
  }
  if (fields.apiTokenInstance === '') {
    errors.apiTokenInstance = 'Введите токен API.'
  }
  return errors
}
