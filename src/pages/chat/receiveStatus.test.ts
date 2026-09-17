import { receiveStatus } from './receiveStatus'
import type { GreenApiErrorKind } from '../../shared/api/greenApi'

test('a polling loop says nothing at all', () => {
  expect(receiveStatus({ status: 'polling' })).toBeNull()
})

test.each<[GreenApiErrorKind, RegExp]>([
  ['unauthorized', /данные входа/i],
  ['suspended', /заблокирован/i],
  ['instanceUnavailable', /Авторизуйте его в личном кабинете/i],
  ['quotaExceeded', /Лимит тарифа/i],
])('a pause on %s explains that kind and asks for a retry', (kind, expected) => {
  const status = receiveStatus({ status: 'paused', kind })
  expect(status?.message).toMatch(expected)
})

test('a suspended account does not read like rejected credentials', () => {
  const suspended = receiveStatus({ status: 'paused', kind: 'suspended' })
  const unauthorized = receiveStatus({ status: 'paused', kind: 'unauthorized' })
  expect(suspended?.message).not.toBe(unauthorized?.message)
  // Only rejected credentials can be corrected by entering different ones.
  expect(unauthorized?.changeCredentials).toBe(true)
  expect(suspended?.changeCredentials).toBe(false)
})

test('a pause on an unclassified kind still tells the user what to do', () => {
  expect(receiveStatus({ status: 'paused', kind: 'transport' })?.message).toMatch(/личном кабинете/i)
})

test.each<GreenApiErrorKind>(['transport', 'rateLimited', 'instanceStarting', 'notAcknowledged'])(
  'retrying after %s shows no banner',
  (kind) => {
    expect(receiveStatus({ status: 'retrying', kind })).toBeNull()
  },
)

test('no message carries credentials, a URL or raw provider text', () => {
  const kinds: GreenApiErrorKind[] = [
    'unauthorized',
    'suspended',
    'instanceUnavailable',
    'quotaExceeded',
    'transport',
    'rateLimited',
  ]
  const messages = kinds.flatMap((kind) => [
    receiveStatus({ status: 'paused', kind })?.message ?? '',
    receiveStatus({ status: 'retrying', kind })?.message ?? '',
  ])

  for (const message of messages) {
    expect(message).not.toMatch(/http|:\/\/|waInstance|apiToken|idInstance|\d{6}/i)
  }
})
