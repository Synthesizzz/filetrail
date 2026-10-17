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
