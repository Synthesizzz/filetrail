// Searching inside files for the Files tab's Contents search: the command to run and how its
// output is read. The query is one argument after -e, so it is never read by a shell and a query
// that starts with a dash is still the pattern. No engine calls here.

import type { GrepMatch } from '../types'

/** Matches kept at most; the count still says how many there were. */
export const MAX_MATCHES = 200
/** A query shorter than this is not run: one letter matches nearly every line. */
export const MIN_QUERY = 2
/** Characters of a matched line kept. */
const MAX_TEXT = 200

export type Match = GrepMatch
export type GrepResult = { matches: Match[]; total: number; capped: boolean }

/**
 * The command for `query`: `git grep` in a repo (it leaves out what git ignores and adds files
 * not yet tracked), a plain recursive `grep` over the folder outside one. Both ignore case, take
 * the query as fixed text and skip binary files.
 */
export function grepArgv(query: string, inRepo: boolean): string[] {
  return inRepo
    ? ['git', 'grep', '-n', '-I', '-i', '-F', '--no-color', '--untracked', '--exclude-standard', '-z', '-e', query]
    : ['grep', '-r', '-n', '-I', '-i', '-F', '--null', '--exclude-dir=.git', '--exclude-dir=node_modules', '-e', query, '.']
}

const clip = (text: string) => {
  const t = text.replace(/\r$/, '').replace(/^\s+/, '')
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t
}

/** One output line as a match, or null when it is not one (a notice, a blank line). */
function record(line: string, inRepo: boolean): Match | null {
  const at = line.indexOf('\0')
  if (at <= 0) return null
  const path = line.slice(0, at).replace(/\\/g, '/').replace(/^\.\//, '')
  const rest = line.slice(at + 1)
  const m = inRepo ? /^(\d+)\0([\s\S]*)$/.exec(rest) : /^(\d+):([\s\S]*)$/.exec(rest)
  if (!m) return null
  return { path, line: Number(m[1]), text: clip(m[2]!) }
}

/** The matches in a search's output: the first `MAX_MATCHES`, how many there were, and whether some were left out. */
export function parseGrep(out: string, inRepo: boolean): GrepResult {
  const matches: Match[] = []
  let total = 0
  for (const line of out.split('\n')) {
    const m = record(line, inRepo)
    if (!m) continue
    total++
    if (matches.length < MAX_MATCHES) matches.push(m)
  }
  return { matches, total, capped: total > matches.length }
}

/** The matches grouped by file, files in the order they first appear. */
export function groupMatches(matches: readonly Match[]): { path: string; items: Match[] }[] {
  const groups = new Map<string, Match[]>()
  for (const m of matches) {
    const list = groups.get(m.path)
    if (list) list.push(m)
    else groups.set(m.path, [m])
  }
  return [...groups].map(([path, items]) => ({ path, items }))
}

/** What the line above the results says. */
export function summaryLine(r: GrepResult): string {
  if (r.total === 0) return 'No matches.'
  const files = new Set(r.matches.map(m => m.path)).size
  const inFiles = `${files} file${files === 1 ? '' : 's'}`
  return r.capped
    ? `${r.total} matches, the first ${r.matches.length} shown in ${inFiles}`
    : `${r.total} match${r.total === 1 ? '' : 'es'} in ${inFiles}`
}
