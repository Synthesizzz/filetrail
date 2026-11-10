// Guards: files and folders Claude may not change. The list is the person's own, kept in
// filetrail's store, never in the project. These are the pure rules: which paths a guard
// covers, which file a write call changes, and whether a shell command names a guarded path.
// A command is read by its words only, so a path it builds itself (`$VAR`, a glob, a `cd`
// first) goes unseen: that check asks, it does not promise.

import { normPath } from './history'

/** The calls that change one file by name. */
const WRITES = new Set(['Edit', 'Write', 'MultiEdit'])

const flat = (path: string) => normPath(path).replace(/\/+$/, '').toLowerCase()

/** The guard that covers `path` (the path itself or a folder above it), as it was stored; undefined when none does. */
export function coveredBy(guards: readonly string[], path: string): string | undefined {
  const p = flat(path)
  return guards.find(g => {
    const k = flat(g)
    return k !== '' && (p === k || p.startsWith(k + '/'))
  })
}

/**
 * The guards after the person presses Guard on `path`: the same path again lifts it; a new one is
 * added, and guards that lie inside a new folder guard go, since the folder holds them already.
 */
export function toggled(own: readonly string[], path: string): string[] {
  const k = flat(path)
  if (own.some(g => flat(g) === k)) return own.filter(g => flat(g) !== k)
  return [...own.filter(g => !flat(g).startsWith(k + '/')), normPath(path).replace(/\/+$/, '')]
}

/** The file a call changes, slashes forward: an edit's `file_path`, a notebook's `notebook_path`; null for any other call. */
export function writtenPath(call: { tool: string; [k: string]: unknown }): string | null {
  const key = WRITES.has(call.tool) ? 'file_path' : call.tool === 'NotebookEdit' ? 'notebook_path' : ''
  const value = key ? call[key] : undefined
  return typeof value === 'string' && value !== '' ? normPath(value) : null
}

/** Every way a command may write a guard's path: whole, from the folder it runs in, `./`, from home, and as Git Bash on Windows spells a drive. */
function spellings(guard: string, cwd: string, home: string): string[] {
  const g = normPath(guard).replace(/\/+$/, '')
  const out = [g]
  const under = (base: string) => {
    const b = normPath(base).replace(/\/+$/, '')
    return b !== '' && g.length > b.length && g.toLowerCase().startsWith(b.toLowerCase() + '/') ? g.slice(b.length + 1) : null
  }
  const rel = under(cwd)
  if (rel !== null) out.push(rel, `./${rel}`)
  const inHome = under(home)
  if (inHome !== null) out.push(`~/${inHome}`)
  const drive = /^([A-Za-z]):\/(.*)$/.exec(g)
  if (drive) out.push(`/${drive[1]!.toLowerCase()}/${drive[2]!}`)
  return out.map(s => s.toLowerCase())
}

/** Whether `text` holds `spelling` as a path of its own: not the end of a longer name, nor the start of one (a `/` after it is a child). */
function names(text: string, spelling: string): boolean {
  for (let at = text.indexOf(spelling); at >= 0; at = text.indexOf(spelling, at + 1)) {
    const before = at === 0 ? '' : text[at - 1]!
    const after = text[at + spelling.length] ?? ''
    if (!/[\w.\-/~]/.test(before) && !/[\w.-]/.test(after)) return true
  }
  return false
}

/** The guard a shell command names, as it was stored; undefined when it names none. */
export function mentionedGuard(command: string, guards: readonly string[], cwd: string, home: string): string | undefined {
  const text = normPath(command).toLowerCase()
  return guards.find(g => spellings(g, cwd, home).some(s => names(text, s)))
}

/** What Claude is told when a guard stops its call. */
export function guardReason(guard: string): string {
  return `${normPath(guard)} is guarded in filetrail, so Claude may not change it. Ask the person to lift the guard (the Guard button on the file in filetrail's Files tab).`
}
