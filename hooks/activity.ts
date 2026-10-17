// What Claude is touching: the path a tool call names and whether it reads
// or writes it, and the folders to open so the tree shows it.

import type { Tone } from '../types'
import { normPath, relTo } from './history'
import { joinPath } from './tree'

/**
 * How long a touched row stays lit, in milliseconds. 2 s proved too short live: the
 * trace showed the row drawn lit, and nobody watching the chat saw it. The last
 * touched row also keeps a quiet ◂ after the light fades.
 */
export const FLASH_MS = 5000

/**
 * The file Claude reads or edits stays lit until it moves to another file or the turn
 * ends, so it can be found at a glance; past this, it goes out anyway (a turn cut off
 * may never say it ended).
 */
export const HOLD_MS = 5 * 60_000

/**
 * A folder the person opened or closed stays as they left it for this long when the
 * follow folds the folders Claude is not working in: they may be browsing it.
 */
export const BROWSE_MS = 30_000

// The tree scrolls under a fixed head (the tabs, the activity card, the search box): the
// pane's own window stays at the top, and filetrail draws only the tree rows that fit,
// from a first row of its own. Moving the pane's window took the card off screen with
// it (seen live), and the engine scrolled to no element by key in the desktop pane.

/** Tree rows drawn however short the pane: a cramped tree still shows where Claude is. */
export const MIN_TREE_ROWS = 6

/** Rows the tree gets: the pane's window less the rows its head takes. */
export function treeRows(bodyRows: number, headRows: number): number {
  return Math.max(MIN_TREE_ROWS, bodyRows - headRows)
}

/** The first tree row on show, kept so the window stays inside the tree. */
export function clampTop(top: number, count: number, rows: number): number {
  return Math.max(0, Math.min(top, count - rows))
}

/** Rows kept between Claude's row and a window edge before the tree moves to it. */
const EDGE = 2

/** The first row that shows row `at`: unchanged while it shows clear of the edges, else mid-window. */
export function topFor(at: number, count: number, rows: number, top: number): number {
  if (at >= top + EDGE && at < top + rows - EDGE) return clampTop(top, count, rows)
  return clampTop(at - Math.floor(rows / 2), count, rows)
}

/**
 * Which tree rows show in `fit` rows from first row `top`: `start` to `end`, with a line
 * saying how many lie above (`above`) when the window is not at the top, and one for
 * those below (`below`) when it is not at the end. The window never runs past the end.
 */
export function treeWindow(count: number, top: number, fit: number) {
  if (count <= fit) return { top: 0, start: 0, end: count, above: 0, below: 0 }
  // Scrolled, the window loses a row to the line above; at the end, none to the line below.
  const t = clampTop(top, count, fit - 1)
  const room = fit - (t > 0 ? 1 : 0)
  const below = count - t - room > 0 ? count - t - (room - 1) : 0
  const end = t + room - (below ? 1 : 0)
  return { top: t, start: t, end, above: t, below }
}

/** Lines a tree window draws: its rows and its above and below lines. */
export function treeLines(w: ReturnType<typeof treeWindow>): number {
  return w.end - w.start + (w.above ? 1 : 0) + (w.below ? 1 : 0)
}

/** Steps of the follow's glide to a new first row, and the time between them (redraws come ten a second at most). */
export const GLIDE_STEPS = 4
export const GLIDE_MS = 100

/** The first rows a glide passes through, easing out, ending on `to`. */
export function glide(from: number, to: number, steps = GLIDE_STEPS): number[] {
  const out: number[] = []
  const span = to - from
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const at = from + Math.sign(span) * Math.round(Math.abs(span) * (1 - (1 - t) ** 2))
    if (at !== from && at !== out[out.length - 1]) out.push(at)
  }
  return out
}

export type Target = { path: string; tone: Tone; follow: boolean }

const READS = new Set(['Read'])
const SEARCHES = new Set(['Grep', 'Glob'])
const WRITES = new Set(['Edit', 'Write', 'MultiEdit'])

/**
 * The path a call touches. Reads and writes of one file are followed (the
 * tree opens to them); a search's folder only lights up if it is on show,
 * so a wide search does not open folders all over the tree.
 */
export function targetOf(call: { tool: string; [k: string]: unknown }): Target | null {
  const str = (k: string) => (typeof call[k] === 'string' && call[k] ? normPath(call[k] as string) : null)
  if (READS.has(call.tool)) { const p = str('file_path'); return p ? { path: p, tone: 'read', follow: true } : null }
  if (WRITES.has(call.tool)) { const p = str('file_path'); return p ? { path: p, tone: 'write', follow: true } : null }
  if (call.tool === 'NotebookEdit') { const p = str('notebook_path'); return p ? { path: p, tone: 'write', follow: true } : null }
  if (SEARCHES.has(call.tool)) { const p = str('path'); return p ? { path: p, tone: 'read', follow: false } : null }
  return null
}

/** The folders between `root` and `path`'s own folder, outermost first; null when `path` is outside `root`. */
export function foldersTo(root: string, path: string): string[] | null {
  const rel = relTo(root, path)
  if (rel === normPath(path)) return null
  const parts = rel.split('/').slice(0, -1)
  const out: string[] = []
  let at = normPath(root).replace(/\/+$/, '')
  for (const part of parts) {
    at = joinPath(at, part)
    out.push(at)
  }
  return out
}
