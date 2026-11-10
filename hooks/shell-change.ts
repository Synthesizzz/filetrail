// Files a shell command changes, found by looking before and after: a command that names
// a file (a script, a redirect, `sed -i`) may shrink or overwrite it, and the history's
// own tools (Edit, Write, MultiEdit) never see that. This keeps a file's size and heading
// count before the command and judges them after. A guess from the command's words alone,
// as bash.ts is: a file the command does not name is not watched. No engine calls here.

import { isInside, normPath } from './history'
import { splitCommands, toPath, tokenize } from './bash'

/** Files watched for one command at most. */
export const MAX_WATCHED = 12
/** Files longer than this (characters) are not watched: a diff of them costs more than it tells. */
export const MAX_WATCH_CHARS = 400_000
/** A file shorter than this is never flagged: halving a few lines is no loss. */
const MIN_FLAG_CHARS = 100
/** Programs whose words are files read, not changed: only their redirects count. */
const NOT_WRITERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'type', 'wc', 'bat', 'nl', 'get-content', 'gc',
  'rg', 'grep', 'egrep', 'fgrep', 'find', 'ls', 'dir', 'tree', 'fd', 'select-string', 'sls',
  'echo', 'printf', 'git', 'gh', 'cd', 'pushd', 'set-location',
])

export type Watched = { path: string; truncates: boolean }

/** A word that names a file: a dotted file name (an extension with a letter in it), not a URL or a flag. */
function looksLikeFile(word: string): boolean {
  if (!word || word.startsWith('-') || word.includes('://')) return false
  const last = normPath(word).split('/').pop() ?? ''
  return /\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(last)
}

function programOf(word: string): string {
  return word.replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.exe$/, '')
}

/**
 * The files of the project a command names and may change, in order, MAX_WATCHED at most:
 * a script and the files it is given, a redirect's target (`truncates` for `>`, not `>>`),
 * `tee`'s files (`truncates` unless `-a`). Stops at a `cd`, and skips a word built at run
 * time, a glob, and the words of a reader, a search or a git command.
 */
export function namedFiles(command: string, root: string): Watched[] {
  const out: Watched[] = []
  const seen = new Set<string>()
  const add = (word: string, truncates: boolean) => {
    if (!looksLikeFile(word)) return
    const path = toPath(root, word)
    if (!path || !isInside(root, path)) return
    const k = path.toLowerCase()
    if (seen.has(k)) {
      // A second mention that truncates counts: the file is overwritten whichever came first.
      if (truncates) for (const w of out) if (w.path.toLowerCase() === k) w.truncates = true
      return
    }
    seen.add(k)
    out.push({ path, truncates })
  }
  for (const segment of splitCommands(command)) {
    const words = tokenize(segment)
    if (!words) continue
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words.shift()
    if (!words.length) continue
    const prog = programOf(words[0]!)
    if (prog === 'cd' || prog === 'pushd' || prog === 'set-location') break
    const writes = !NOT_WRITERS.has(prog)
    const tee = prog === 'tee'
    const appends = tee && words.some(w => w === '-a' || w === '--append')
    // A redirect counts wherever it stands, even leading the command (`> notes.md`); the
    // program's own word (index 0) is never a file.
    for (let k = 0; k < words.length; k++) {
      const w = words[k]!
      const redirect = /^\d?(>>?)(.*)$/.exec(w)
      if (redirect) {
        const target = redirect[2] || words[++k] || ''
        if (!target.startsWith('&')) add(target, redirect[1] === '>')
        continue
      }
      if (k > 0 && writes) add(w, tee && !appends)
    }
  }
  return out.slice(0, MAX_WATCHED)
}

/** A file as it stood: its length in characters, its Markdown headings, and its text (for a capped copy). */
export type Snapshot = { size: number; headings: number; text: string }

export function snapshot(text: string, markdown = true): Snapshot {
  let headings = 0
  // Only a Markdown file has headings: a `# ` line in a script or a config is a comment.
  if (markdown) for (const line of text.split(/\r?\n/)) if (/^#{1,6}\s/.test(line)) headings++
  return { size: text.length, headings, text }
}

/** 850 as `850`, 12340 as `12.3k`. */
export function formatSize(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}

/** What went wrong with a file: a short label for the card, and a note for the history step. */
export type Flagged = { flag: string; note: string }

/**
 * Whether the command did harm to a file that was there before: it shrank by more than
 * half, its headings fell to under half (of two or more), or a truncating redirect
 * rewrote it. null when it was left alone, grew, or is too short to matter.
 */
export function judge(before: Snapshot, after: Snapshot, truncates: boolean): Flagged | null {
  if (before.text === after.text) return null
  const sizes = `${formatSize(before.size)} → ${formatSize(after.size)}`
  const heads = before.headings > 0 && before.headings !== after.headings ? ` · ## ${before.headings} → ${after.headings}` : ''
  const pct = before.size > 0 ? Math.round((1 - after.size / before.size) * 100) : 0
  if (truncates && before.size > 0) {
    return { flag: 'Overwritten', note: `overwritten ${sizes}${heads}` }
  }
  if (before.size >= MIN_FLAG_CHARS && after.size * 2 < before.size) {
    return { flag: `Shrank −${pct}%`, note: `shrank ${sizes} (−${pct}%)${heads}` }
  }
  if (before.headings >= 2 && after.headings * 2 < before.headings) {
    return { flag: `Headings ${before.headings} → ${after.headings}`, note: `headings fell${heads} · ${sizes}` }
  }
  return null
}
