// How filetrail fits text to the pane's width. No engine calls here.

/** Below this many columns the pane is narrow: filename-first paths, shorter titles. */
export const NARROW_COLUMNS = 56
/** From this many columns History shows the turn list and the diff side by side. */
export const WIDE_COLUMNS = 100

/** A space no surface collapses or wraps at. */
export const NBSP = ' '
/** A narrow one, between the parts of a tree row: a full space set them too far apart (seen live). */
export const NNBSP = '\u202f'

/** "trail-demo/deep/notes.md" → name "notes.md", dir "trail-demo/deep" ('' at the top). */
export function splitPath(path: string): { name: string; dir: string } {
  const p = path.replace(/\\/g, '/')
  const at = p.lastIndexOf('/')
  return at < 0 ? { name: p, dir: '' } : { name: p.slice(at + 1), dir: p.slice(0, at) }
}

/**
 * Keeps a code line's shape on a surface that collapses spaces, while leaving
 * it free to wrap: leading spaces and runs of two or more become non-breaking,
 * single spaces between words stay plain so a long line can break there.
 */
export function keepIndent(text: string): string {
  return text
    .replace(/^ +/, m => NBSP.repeat(m.length))
    .replace(/ {2,}/g, m => NBSP.repeat(m.length))
}

/** Cuts text to `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "17:05", in the machine's local time. */
export function clockOf(at: number): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A day as History heads it: "Today", "Yesterday", "Oct 14", or "Dec 31, 2025" in another year. */
export function dayLabel(at: number, now: number): string {
  const d = new Date(at)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const today = day(new Date(now))
  // Whole days between, by the calendar (a daylight-saving day is 23 or 25 hours).
  const back = Math.round((today - day(d)) / 86_400_000)
  if (back === 0) return 'Today'
  if (back === 1) return 'Yesterday'
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${md}, ${d.getFullYear()}`
}

/** "17:05" today, "Oct 16 17:05" on another day, in the machine's local time. */
export function formatAt(at: number, now: number): string {
  const d = new Date(at)
  const n = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? hm : `${MONTHS[d.getMonth()]} ${d.getDate()} ${hm}`
}

/** A file's time as filetree shows it: `2026-10-02 09:24`, local time. */
export function stampOf(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
