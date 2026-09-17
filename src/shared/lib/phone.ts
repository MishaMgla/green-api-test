/**
 * Normalizes a recipient phone number to digits.
 * Accepts the supported Russian (7) and Belarusian (375) formats with an
 * optional leading `+`, spaces, brackets and hyphens. Returns null for
 * anything else; country codes are never guessed.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/^\+/, '').replace(/[\s()-]/g, '')
  return /^7\d{10}$/.test(digits) || /^375\d{9}$/.test(digits) ? digits : null
}
