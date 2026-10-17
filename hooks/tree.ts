// The Files tab's tree: listings turned into entries, and the rows on show.

import type { Entry, Turn } from '../types'
import { normPath } from './history'

/** Never listed: git's own folder. */
export const HIDDEN = new Set(['.git'])
/** Entries kept per folder; the rest are counted on a row of their own. */
export const MAX_ENTRIES = 500

export const lower = (path: string) => normPath(path).replace(/\/+$/, '').toLowerCase()

export function joinPath(dir: string, name: string): string {
  return normPath(dir).replace(/\/+$/, '') + '/' + name
}

export function parentOf(path: string): string {
  const p = normPath(path).replace(/\/+$/, '')
  const at = p.lastIndexOf('/')
  return at <= 0 ? p : p.slice(0, at)
}

type Listed = { name: string; kind: 'file' | 'dir' | 'other'; isLink: boolean; mtimeMs?: number }

/** A folder's entries, folders first, then by name ignoring case; `.git` left out. */
export function toEntries(dir: string, listed: readonly Listed[]): { entries: Entry[]; more: number } {
  const all = listed
    .filter(l => !HIDDEN.has(l.name))
    .map(l => ({
      name: l.name, path: joinPath(dir, l.name), kind: l.kind === 'dir' ? 'dir' as const : 'file' as const,
      ...(l.kind !== 'dir' && l.mtimeMs ? { at: l.mtimeMs } : {}),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.kind === 'dir' ? -1 : 1))
  return { entries: all.slice(0, MAX_ENTRIES), more: Math.max(0, all.length - MAX_ENTRIES) }
}

export type Row = { entry: Entry; depth: number; isOpen: boolean }

/** The rows on show: the root's entries, and each open folder's beneath it. */
export function visibleRows(root: string, listing: Readonly<Record<string, Entry[]>>, expanded: readonly string[]): Row[] {
  const open = new Set(expanded)
  const rows: Row[] = []
  const walk = (dir: string, depth: number) => {
    for (const entry of listing[lower(dir)] ?? []) {
      const isOpen = entry.kind === 'dir' && open.has(lower(entry.path))
      rows.push({ entry, depth, isOpen })
      if (isOpen) walk(entry.path, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

/** How many applied edits each file has in the history, by lower-cased path. */
export function editCounts(turns: readonly Turn[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of turns) for (const s of t.steps) {
    if (s.status !== 'ok') continue
    const k = lower(s.path)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

/** Whether any counted path sits beneath `dir`. */
export function hasEditsBelow(counts: ReadonlyMap<string, number>, dir: string): boolean {
  const prefix = lower(dir) + '/'
  for (const k of counts.keys()) if (k.startsWith(prefix)) return true
  return false
}
