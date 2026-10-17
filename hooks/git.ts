// Reading `git status --porcelain=v1 -b -z` and `git diff --numstat` into
// the Files tab's per-path status and line counts. No engine calls here.

import type { Branch, GitInfo } from '../types'
import { relTo } from './history'
import { lower } from './tree'

/** One status letter for an XY pair: conflicts first, then the worktree side, then the index. */
export function codeOf(xy: string): string {
  const x = xy[0] ?? ' '
  const y = xy[1] ?? ' '
  if (xy === '??') return '?'
  if (x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD') return 'U'
  const c = y !== ' ' ? y : x
  if (c === 'T') return 'M'
  if (c === 'C') return 'A'
  return c
}

export function parseBranch(line: string): Branch | null {
  const text = line.replace(/^## /, '')
  if (text.startsWith('HEAD (no branch)')) return { head: 'HEAD', upstream: '', ahead: 0, behind: 0 }
  const fresh = /^No commits yet on (.+)$/.exec(text)
  if (fresh) return { head: fresh[1]!, upstream: '', ahead: 0, behind: 0 }
  const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(text)
  if (!m) return null
  const counts = m[3] ?? ''
  return {
    head: m[1]!,
    upstream: m[2] ?? '',
    ahead: Number(/ahead (\d+)/.exec(counts)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(counts)?.[1] ?? 0),
  }
}

/** `git status --porcelain=v1 -b -z`: the branch line, then `XY path` records; a rename's source follows it. */
export function parseStatus(out: string): Pick<GitInfo, 'branch' | 'status' | 'untrackedDirs'> {
  const parts = out.split('\0')
  let branch: Branch | null = null
  const status: Record<string, string> = {}
  const untrackedDirs: string[] = []
  for (let k = 0; k < parts.length; k++) {
    const rec = parts[k]!
    if (!rec) continue
    if (rec.startsWith('## ')) { branch = parseBranch(rec); continue }
    const xy = rec.slice(0, 2)
    const path = rec.slice(3)
    if (xy[0] === 'R' || xy[0] === 'C') k++
    const code = codeOf(xy)
    if (code === '?' && path.endsWith('/')) untrackedDirs.push(path.toLowerCase())
    else status[lower(path)] = code
  }
  return { branch, status, untrackedDirs }
}

/** `git diff --numstat`: `add<TAB>del<TAB>path`, a rename written `a => b` or `dir/{a => b}/f`. */
export function parseNumstat(out: string): Record<string, [number, number]> {
  const counts: Record<string, [number, number]> = {}
  for (const line of out.split(/\r?\n/)) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (!m) continue
    let path = m[3]!
    if (path.includes(' => ')) {
      path = path.includes('{') ? path.replace(/\{[^}]* => ([^}]*)\}/, '$1').replace(/\/\//g, '/') : path.split(' => ')[1]!
    }
    counts[lower(path)] = [m[1] === '-' ? 0 : Number(m[1]), m[2] === '-' ? 0 : Number(m[2])]
  }
  return counts
}

/** The status letter for a file, '' when clean or outside the repo. */
export function fileStatus(git: GitInfo | null, path: string): string {
  if (!git) return ''
  const rel = relTo(git.top, path).toLowerCase()
  if (rel === path.toLowerCase().replace(/\\/g, '/')) return ''
  const own = git.status[rel]
  if (own) return own
  return git.untrackedDirs.some(d => rel.startsWith(d)) ? '?' : ''
}

/** A folder's status: '?' when it or every changed path beneath it is untracked, 'M' when anything else changed beneath it. */
export function dirStatus(git: GitInfo | null, dir: string): string {
  if (!git) return ''
  const rel = relTo(git.top, dir).toLowerCase().replace(/\/+$/, '')
  const prefix = rel + '/'
  if (git.untrackedDirs.some(d => prefix.startsWith(d))) return '?'
  let found = ''
  for (const [k, c] of Object.entries(git.status)) {
    if (!k.startsWith(prefix)) continue
    if (c !== '?') return 'M'
    found = '?'
  }
  if (!found && git.untrackedDirs.some(d => d.startsWith(prefix))) found = '?'
  return found
}

export function lineCounts(git: GitInfo | null, path: string): [number, number] | null {
  if (!git) return null
  return git.numstat[relTo(git.top, path).toLowerCase()] ?? null
}
