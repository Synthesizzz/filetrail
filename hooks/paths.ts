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

/**
 * Columns a character takes in a pane: none for a combining mark (the vowels and tone marks
 * Thai sets above and below a letter), two for a wide East Asian one, else one.
 */
export function cellWidth(ch: string): number {
  if (/^[\p{Mn}\p{Me}\p{Cf}]$/u.test(ch)) return 0
  const cp = ch.codePointAt(0) ?? 0
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
  return wide ? 2 : 1
}

/** Columns a text takes: `text.length` counts a Thai tone mark as a column, this does not. */
export function cells(text: string): number {
  let n = 0
  for (const ch of text) n += cellWidth(ch)
  return n
}

/** Cuts text to `max` columns with an ellipsis; a letter keeps the marks set on it. */
export function clipCells(text: string, max: number): string {
  if (cells(text) <= max) return text
  const room = Math.max(1, max - 1)
  let used = 0
  let out = ''
  for (const ch of text) {
    const w = cellWidth(ch)
    if (used + w > room) break
    used += w
    out += ch
  }
  return out + '…'
}

/**
 * How many lines a text takes in a column `columns` wide, as the pane wraps it: at plain
 * spaces (a non-breaking one glues), a word longer than the column starting a line of its
 * own and cut across more. Thai has no spaces, so it fills each line. Where a spine must
 * run beside the text, this is the height to run it to.
 */
export function wrapLines(text: string, columns: number): number {
  const room = Math.max(1, columns)
  let lines = 1
  let used = 0
  for (const word of text.split(' ')) {
    const w = cells(word)
    if (w > room) {
      if (used > 0) lines++
      const k = Math.ceil(w / room)
      lines += k - 1
      used = w - room * (k - 1)
    } else if (used === 0) {
      used = w
    } else if (used + 1 + w <= room) {
      used += 1 + w
    } else {
      lines++
      used = w
    }
  }
  return lines
}

/** Turns closer than this many minutes draw no gap between them. */
export const GAP_MIN = 8

/** "23 min earlier", "1 h 5 min earlier", "2 d earlier"; '' for a gap under GAP_MIN minutes. */
export function gapText(minutes: number): string {
  if (minutes < GAP_MIN) return ''
  if (minutes < 60) return `${minutes} min earlier`
  if (minutes < 1440) {
    const m = minutes % 60
    return `${Math.floor(minutes / 60)} h${m ? ` ${m} min` : ''} earlier`
  }
  const h = Math.floor((minutes % 1440) / 60)
  return `${Math.floor(minutes / 1440)} d${h ? ` ${h} h` : ''} earlier`
}

/** Whole minutes from `earlier` to `later` (both in ms), 0 when it runs backwards. */
export function gapMinutes(later: number, earlier: number): number {
  return Math.max(0, Math.floor((later - earlier) / 60_000))
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

/**
 * A badge's colours. The desktop lays a translucent fill (`#rrggbbaa`) over the pane; the
 * terminal drops the alpha and paints the colour opaque, so text in the badge's own colour
 * came out blank (seen live: a file's extension). Solid, the colour is the fill and the
 * ink is dark or white, whichever reads on it.
 */
export function badgeColors(solid: boolean, color: string, fill: string): { c: string; bg: string } {
  if (!solid) return { c: color, bg: fill }
  const n = parseInt(color.slice(1, 7), 16)
  const luma = Number.isNaN(n) ? 0 : 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return { c: luma > 150 ? '#1f1e1d' : '#ffffff', bg: color }
}
