// Reading a Bash command for the files it reads, and whether it commits.
// A guess from the command's words alone: anything unclear is skipped rather
// than lit in the wrong place. No engine calls here.

import { normPath } from './history'
import { joinPath } from './tree'

/** Commands whose arguments are files they read; their first file is followed. */
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'type', 'wc', 'bat', 'nl', 'get-content', 'gc'])
/** Commands that search or list: their path arguments light up, nothing is followed. */
const SEARCHERS = new Set(['rg', 'grep', 'egrep', 'fgrep', 'find', 'ls', 'dir', 'tree', 'fd', 'select-string', 'sls'])
/** Searchers whose first plain argument is the pattern, not a path. */
const PATTERN_FIRST = new Set(['rg', 'grep', 'egrep', 'fgrep', 'fd', 'select-string', 'sls'])
/**
 * Flags that take the next word as their value, per kind of command: `-n` is a count
 * for head and tail but a plain switch for grep and rg (`rg -n greet src` once lost
 * its path to that confusion).
 */
const HEAD_TAIL_VALUES = new Set(['-n', '-c'])
const SEARCH_VALUES = new Set([
  '-e', '-f', '-A', '-B', '-C', '-m', '-g', '-t', '-T', '--glob', '--type', '--max-count',
  '--context', '--before-context', '--after-context', '-Pattern',
])
const POWERSHELL_VALUES = new Set(['-Encoding', '-TotalCount', '-Tail', '-Head', '-First', '-Last', '-Delimiter', '-ReadCount'])

function valueFlagsOf(prog: string): ReadonlySet<string> {
  if (prog === 'head' || prog === 'tail') return HEAD_TAIL_VALUES
  if (prog === 'get-content' || prog === 'gc' || prog === 'select-string' || prog === 'sls') return new Set([...POWERSHELL_VALUES, ...SEARCH_VALUES])
  if (SEARCHERS.has(prog)) return SEARCH_VALUES
  return new Set()
}
/** PowerShell flags whose value is the file itself. */
const PATH_FLAGS = new Set(['-path', '-literalpath'])

export type BashTarget = { path: string; follow: boolean }

/** Splits a command line at `&&`, `||`, `;`, `|` and newlines that are outside quotes. */
export function splitCommands(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (quote) {
      cur += c
      if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') { out.push(cur); cur = ''; i++; continue }
    if (c === ';' || c === '|' || c === '\n') { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(Boolean)
}

/** Splits one command into words, quotes removed; null when a word is built at run time ($, backticks). */
export function tokenize(segment: string): string[] | null {
  const words: string[] = []
  let cur = ''
  let quote = ''
  let started = false
  for (const c of segment) {
    if (quote) {
      if (c === quote) quote = ''
      else { if (quote === '"' && (c === '$' || c === '`')) return null; cur += c }
      continue
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue }
    if (c === '$' || c === '`') return null
    if (/\s/.test(c)) { if (started) { words.push(cur); cur = ''; started = false } continue }
    cur += c
    started = true
  }
  if (started) words.push(cur)
  return words
}

/** A word as an absolute path: Git Bash's /c/... becomes C:/..., a relative one sits under the root. */
export function toPath(root: string, word: string): string | null {
  if (!word || word === '-' || word.startsWith('~') || /[*?[\]{}<>]/.test(word)) return null
  const p = normPath(word).replace(/^\/([a-zA-Z])\//, (_, d: string) => `${d.toUpperCase()}:/`)
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) return p
  return joinPath(root, p.replace(/^\.\//, ''))
}

function programOf(word: string): string {
  return word.replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.exe$/, '')
}

/**
 * The paths a command reads, in order. Stops at a `cd` (paths after it are not
 * from the root any more) and skips any command with a word built at run time.
 */
export function readTargets(command: string, root: string): BashTarget[] {
  const out: BashTarget[] = []
  for (const segment of splitCommands(command)) {
    const words = tokenize(segment)
    if (!words) continue
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words.shift()
    if (!words.length) continue
    const prog = programOf(words[0]!)
    if (prog === 'cd' || prog === 'pushd' || prog === 'set-location') break
    const isReader = READERS.has(prog)
    if (!isReader && !SEARCHERS.has(prog)) continue
    const args: string[] = []
    const valueFlags = valueFlagsOf(prog)
    let patternGiven = false
    for (let k = 1; k < words.length; k++) {
      const w = words[k]!
      const flag = w.toLowerCase()
      if (PATH_FLAGS.has(flag)) { if (words[k + 1]) args.push(words[++k]!); continue }
      if (w === '-e' || w === '-f' || w === '-Pattern') patternGiven = true
      if (valueFlags.has(w)) { k++; continue }
      if (w.startsWith('-')) {
        // find's expression starts at its first flag: no paths after it.
        if (prog === 'find') break
        continue
      }
      args.push(w)
    }
    const paths = PATTERN_FIRST.has(prog) && !patternGiven ? args.slice(1) : args
    for (const word of paths) {
      const path = toPath(root, word)
      if (path) out.push({ path, follow: isReader })
    }
  }
  return out
}

/** Whether any part of the command runs `git commit` (git's own flags before it allowed). */
export function isCommit(command: string): boolean {
  return splitCommands(command).some(segment => {
    const words = tokenize(segment)
    if (!words || programOf(words[0] ?? '') !== 'git') return false
    for (let k = 1; k < words.length; k++) {
      const w = words[k]!
      if (w === '-C' || w === '-c') { k++; continue }
      if (w.startsWith('-')) continue
      return w === 'commit'
    }
    return false
  })
}
