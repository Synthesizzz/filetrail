// Files Claude writes outside the project: the rule for what counts, and the list kept of them.
// A write from a shell command is not counted (its targets are not known), so the list is
// what Edit, Write and NotebookEdit did. No engine calls here.

import { normPath } from './history'

/** Files kept on the list at most; the newest stay. */
export const OUTSIDE_MAX = 50

/** Where work goes without being a stray write: temp folders, whatever the system's spelling. */
const SCRATCH = [
  /^(\/private)?\/(tmp|var\/tmp|var\/folders)(\/|$)/,
  /\/appdata\/local\/temp(\/|$)/,
  /^[a-z]:\/windows\/temp(\/|$)/,
]

/** A path made absolute from `base` when it is relative, with `.` and `..` settled, slashes forward, lower-cased. */
function settled(base: string, path: string): string {
  const p = normPath(path)
  const joined = /^([A-Za-z]:|\/|~)/.test(p) ? p : `${normPath(base).replace(/\/+$/, '')}/${p}`
  const out: string[] = []
  for (const part of joined.split('/')) {
    if (part === '..') { if (out.length > 1) out.pop() } else if (part !== '.') out.push(part)
  }
  return out.join('/').replace(/\/+$/, '').toLowerCase()
}

const under = (path: string, folder: string) => folder !== '' && (path === folder || path.startsWith(folder + '/'))

/** `path` as one spelling of itself (absolute from `base`, dots settled, slashes forward, lower-cased): two spellings of a file give the same string. */
export const canonical = settled

/** Whether `path` is the project's folder `base` or inside it, `..` and case and slashes aside. */
export function isWithin(base: string, path: string): boolean {
  return base !== '' && under(settled(base, path), settled(base, base))
}

/**
 * Whether a write to `path` lands outside the project at `base`, apart from Claude's own config
 * folder (`.claude` in the home folder) and the temp folders. With no project folder known
 * nothing is outside.
 */
export function isOutside(base: string, home: string, path: string): boolean {
  if (!base) return false
  const p = settled(base, path)
  const b = settled(base, base)
  if (under(p, b)) return false
  if (home && under(p, settled(base, home) + '/.claude')) return false
  return !SCRATCH.some(rule => rule.test(p))
}

/** The list after one more file: newest first, a file once (the spelling of its latest write), `OUTSIDE_MAX` at most. */
export function addOutside(list: readonly string[], path: string): string[] {
  const p = normPath(path)
  const key = p.toLowerCase()
  return [p, ...list.filter(x => x.toLowerCase() !== key)].slice(0, OUTSIDE_MAX)
}
