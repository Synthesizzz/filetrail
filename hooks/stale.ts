// Files Claude read that changed after: a checksum of each file as it was read and git's HEAD
// at the time, compared with the file and HEAD later. What changed it is told from the disk and
// git alone, plus the edits filetrail itself recorded: Claude's, a commit, or neither (a change
// from outside the session). No engine calls here.

import type { StaleBy } from '../types'

/** Files remembered at most: the newest read ones. */
export const MAX_READS = 40

/** A file as Claude read it: where, when, a checksum of its text, and git's HEAD then (null outside a repo). */
export type ReadRecord = { path: string; at: number; sum: string; head: string | null }

/** FNV-1a over the text's UTF-16 units, with its length: cheap, and a change in any place shows. */
export function checksum(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${text.length}:${h.toString(16)}`
}

const WORD: Record<StaleBy, string> = { edit: 'edited', commit: 'committed', outside: 'changed outside' }

/** What changed a file, as the row says it: "edited", "committed", "edited + committed", "changed outside". */
export function staleLabel(by: readonly StaleBy[]): string {
  return by.map(b => WORD[b]).join(' + ')
}

/** Keeps `rec` as the file's read, the newest last, and no more than MAX_READS files. */
export function remember(reads: Map<string, ReadRecord>, key: string, rec: ReadRecord): void {
  reads.delete(key)
  reads.set(key, rec)
  while (reads.size > MAX_READS) reads.delete(reads.keys().next().value as string)
}

/**
 * What changed a file since it was read, or null when nothing did. `now.sum` is its checksum
 * now (null: gone or unreadable, which the deletion record owns); `edited` that filetrail
 * recorded an edit of it after the read; `committed` that a commit since then holds it. A
 * change with none of those is "outside": the person, another tool, another session.
 */
export function judgeStale(rec: ReadRecord, now: { sum: string | null }, edited: boolean, committed: boolean): StaleBy[] | null {
  if (now.sum === null) return null
  const changed = now.sum !== rec.sum
  const by: StaleBy[] = []
  if (edited) by.push('edit')
  if (committed) by.push('commit')
  if (changed && !edited && !committed) by.push('outside')
  return by.length ? by : null
}
