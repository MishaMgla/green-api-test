import { normalizePhone } from './phone'

// The formats the README promises, in the shapes people actually paste.
test.each([
  ['+7 (999) 123-45-67', '79991234567'],
  ['79991234567', '79991234567'],
  ['+7 999 123 45 67', '79991234567'],
  ['  +79991234567  ', '79991234567'],
  ['+375 29 123-45-67', '375291234567'],
  ['375291234567', '375291234567'],
])('accepts %j', (input, digits) => {
  expect(normalizePhone(input)).toBe(digits)
})

// Rejected rather than reshaped: guessing a country code would address a stranger.
test.each([
  ['', 'empty'],
  ['8-999-123-45-67', 'a domestic Russian prefix'],
  ['9991234567', 'no country code'],
  ['799912345678', 'one digit too many'],
  ['7999123456', 'one digit too few'],
  ['37529123456', 'a Belarusian number one digit short'],
  ['+1 202 555 0143', 'an unsupported country'],
  ['+7 (999) 123-45-6a', 'a letter'],
  ['+7,999,123,45,67', 'an unsupported separator'],
])('rejects %j — %s', (input) => {
  expect(normalizePhone(input)).toBeNull()
})
