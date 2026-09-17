import type { Credentials } from '../../shared/api/greenApi'

export type CredentialErrors = Partial<Record<keyof Credentials, string>>

/** True only for a bare HTTPS origin: no userinfo, path, query, or fragment. */
function isDashboardOrigin(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    (url.pathname === '' || url.pathname === '/') &&
    url.search === '' &&
    url.hash === ''
  )
}

/** Local validation only: it never contacts the provider and never probes the queue. */
export function validateCredentials(fields: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (!/^\d{10}$/.test(fields.idInstance)) {
    errors.idInstance = 'Instance ID is the 10-digit number shown in the dashboard.'
  }
  if (fields.apiTokenInstance === '') {
    errors.apiTokenInstance = 'API token is required.'
  }
  if (!isDashboardOrigin(fields.apiUrl)) {
    errors.apiUrl = 'Use the HTTPS origin from the dashboard, with no path, query, or fragment.'
  }
  return errors
}
