/**
 * Circular initials avatar. No photo is ever available in this assignment, so the
 * reference's five-colour fallback palette is picked deterministically from the chat ID.
 */

/** Two-stop gradients + white initials, transcribed from the reference fallback set. */
const PALETTE = [
  'from-[#fa82ba] to-[#e74aa6]',
  'from-[#ffb381] to-[#e5782d]',
  'from-[#1bd6e3] to-[#27a5c8]',
  'from-[#79bcff] to-[#4289ed]',
  'from-[#9b90fe] to-[#6746ec]',
]

/** Stable per-chat colour: the same ID always gets the same gradient. */
function paletteIndex(id: string): number {
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i)
  return sum % PALETTE.length
}

/** First letters of the first two words; numeric chat IDs fall back to their first character. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
  return letters.toUpperCase() || '?'
}

export function Avatar({ id, name, size }: { id: string; name: string; size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-b font-medium text-white ${
        PALETTE[paletteIndex(id)]
      } ${size === 'lg' ? 'size-16 text-xl' : 'size-10 text-sm'}`}
    >
      {initials(name)}
    </span>
  )
}
