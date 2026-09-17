import { useState, type FormEvent } from 'react'
import type { Credentials } from '../../shared/api/greenApi'
import { validateCredentials, type CredentialErrors } from './credentials'

const EMPTY: Credentials = { idInstance: '', apiTokenInstance: '' }

/** `note` is always visible: every value is copied from the instance page, and the
    placeholder alone reads as a value that is already filled in. */
const FIELDS: {
  name: keyof Credentials
  label: string
  type: string
  hint: string
  note: string
}[] = [
  {
    name: 'idInstance',
    label: 'ID инстанса',
    type: 'text',
    hint: '1101000001',
    note: 'idInstance со страницы инстанса в личном кабинете GREEN-API.',
  },
  {
    name: 'apiTokenInstance',
    label: 'Токен API',
    type: 'password',
    hint: '',
    note: 'apiTokenInstance с той же страницы.',
  },
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
        <h1 className="text-lg font-semibold">Чат MAX · GREEN-API</h1>
        {FIELDS.map(({ name, label, type, hint, note }) => (
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
              aria-describedby={errors[name] ? `${name}-error` : `${name}-note`}
              onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
              className="bg-hover focus-visible:outline-accent rounded-xl px-3 py-2 text-[15px]/5 focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
            {errors[name] ? (
              <p id={`${name}-error`} role="alert" className="text-muted">
                {errors[name]}
              </p>
            ) : (
              <p id={`${name}-note`} className="text-muted text-[13px]/4">
                {note}
              </p>
            )}
          </div>
        ))}
        <button
          type="submit"
          className="bg-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed focus-visible:outline-accent rounded-xl px-3 py-2 text-[15px]/5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Войти
        </button>
      </form>
    </main>
  )
}
