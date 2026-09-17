/** 24-hour clock, as the reference shows it; the locale is fixed so it never drifts. */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
