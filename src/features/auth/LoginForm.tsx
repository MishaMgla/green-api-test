import { useState, type FormEvent } from 'react'
import type { Credentials } from '../../shared/api/greenApi'
import { validateCredentials, type CredentialErrors } from './credentials'

const EMPTY: Credentials = { idInstance: '', apiTokenInstance: '', apiUrl: '' }

const FIELDS: { name: keyof Credentials; label: string; type: string; hint: string }[] = [
  { name: 'idInstance', label: 'Instance ID', type: 'text', hint: '1101000001' },
  { name: 'apiTokenInstance', label: 'API token', type: 'password', hint: '' },
  { name: 'apiUrl', label: 'Dashboard API origin', type: 'text', hint: 'https://1101.api.green-api.com' },
]

/** Collects runtime credentials. They reach memory only, never storage. */
export function LoginForm({ onSubmit }: { onSubmit: (credentials: Credentials) => void }) {
  const [fields, setFields] = useState<Credentials>(EMPTY)
  const [errors, setErrors] = useState<CredentialErrors>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed: Credentials = {
      idInstance: fields.idInstance.trim(),
      apiTokenInstance: fields.apiTokenInstance.trim(),
      apiUrl: fields.apiUrl.trim(),
    }
    const found = validateCredentials(trimmed)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(trimmed)
  }

  return (
    <main className="bg-app text-ink font-sans grid min-h-screen place-items-center p-4">
      <form
        noValidate
        onSubmit={submit}
        className="bg-sidebar flex w-full max-w-md flex-col gap-4 rounded-2xl p-6 shadow-[0_4px_16px_#00000014,0_0_2px_#00000014]"
      >
        <h1 className="text-lg font-semibold">GREEN-API MAX chat</h1>
        {FIELDS.map(({ name, label, type, hint }) => (
          <div key={name} className="flex flex-col gap-1">
            <label htmlFor={name}>{label}</label>
            <input
              id={name}
              name={name}
              type={type}
              autoComplete="off"
              placeholder={hint}
              value={fields[name]}
              aria-invalid={errors[name] !== undefined}
              aria-describedby={errors[name] ? `${name}-error` : undefined}
              onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
              className="bg-hover focus-visible:outline-accent rounded-xl px-3 py-2 text-[15px]/5 focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
            {errors[name] && (
              <p id={`${name}-error`} role="alert" className="text-muted">
                {errors[name]}
              </p>
            )}
          </div>
        ))}
        <button
          type="submit"
          className="bg-accent focus-visible:outline-accent rounded-xl px-3 py-2 text-[15px]/5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Log in
        </button>
      </form>
    </main>
  )
}
