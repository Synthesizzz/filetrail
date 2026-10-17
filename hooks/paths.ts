// How filetrail fits text to the pane's width. No engine calls here.

/** Below this many columns the pane is narrow: filename-first paths, shorter titles. */
export const NARROW_COLUMNS = 56
/** From this many columns History shows the turn list and the diff side by side. */
export const WIDE_COLUMNS = 100

/** A space no surface collapses or wraps at. */
export const NBSP = ' '

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
