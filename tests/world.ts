// The world beneath filetrail in tests: the core events it raises answered,
// a store the test can read, and every history the mod writes to its state.
// The test `$` has no $.store or $.state, so both are kept here.

import { mock } from 'claude-code/testing'

import type { Turn } from '../types'

export const START = { cwd: 'C:\\work\\demo', surface: 'desktop', isInteractive: true } as const
export const KEY = 'p:c:/work/demo'
// The engine reads `answer` here although the declarations name `text`; both are passed.
export const DONE = { durationMs: 1, isAborted: false, reason: 'answer', text: '', answer: '' } as const

/** What `git` answers: the repo's top, `status --porcelain=v1 -b -z` and `diff --numstat HEAD`. */
export type GitWorld = { top: string; status: string; numstat: string; lsFiles?: string; show?: string; ignored?: string }

export type WorldOptions = {
  files?: Record<string, string>
  stored?: Record<string, unknown>
  now?: number
  /** Folder listings by path (any slashes, any case): `[name, kind]` each. */
  dirs?: Record<string, [string, 'file' | 'dir'][]>
  /** Absent: not a repo. */
  git?: GitWorld
  /** Environment variables the mod may read (HOME, USERPROFILE). */
  env?: Record<string, string>
  /** Runs as a Bash command does, before it answers: a test deletes files here. */
  onBash?: (command: string) => void
}

const key = (p: string) => p.split('\\').join('/').replace(/\/+$/, '').toLowerCase()

export function world(on: any, { files = {}, stored = {}, now = 1_800_000_000_000, dirs = {}, git, env = {}, onBash }: WorldOptions = {}) {
  mock.env(on, env)
  // The engine makes a written path absolute for this machine before the hook sees it
  // ('/home/x' arrives as 'C:\home\x' on Windows): kept here with forward slashes.
  const writes: Record<string, string> = {}
  on('fs.write', (_$: any, e: any) => { writes[String(e.path).split('\\').join('/')] = e.text; return { value: undefined } })
  // prompt.fill is answered with its result itself, not wrapped in { value }.
  const fills: { text: string; mode?: string }[] = []
  on('prompt.fill', (_$: any, e: any) => { fills.push({ text: e.text, mode: e.mode }); return { isFilled: true } })
  const toasts: string[] = []
  on('ui.toast', (_$: any, e: any) => { toasts.push(String(e.text)); return { value: undefined } })
  const store = new Map<string, unknown>(Object.entries(stored))
  on('store.get', (_$: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_$: any, e: any) => { store.set(e.key, JSON.parse(JSON.stringify(e.value))); return { value: undefined } })
  on('store.delete', (_$: any, e: any) => { store.delete(e.key); return { value: undefined } })
  const history: Turn[][] = []
  // Every value the mod writes, in order, by key (the test `$` cannot read state back).
  const states: Record<string, unknown[]> = {}
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.key === 'history') history.push(e.value)
    ;(states[e.key] ??= []).push(JSON.parse(JSON.stringify(e.value ?? null)))
    return next(e)
  })
  const clock = mock.clock(on, { now })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: START.cwd }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.text }))
  on('command.register', () => ({ value: undefined }))
  const opens: unknown[] = []
  on('ui.open', (_$: any, e: any) => { opens.push(e); return { value: { isPlaced: true } } })
  const closes: unknown[] = []
  on('ui.close', (_$: any, e: any) => { closes.push(e); return { value: undefined } })
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in files }))
  on('fs.read', (_$: any, e: any) => ({ value: files[e.path] }))
  on('tool.call', (_$: any, e: any) => {
    if (String(e.file_path).endsWith('denied.ts')) return { deny: 'The user refused this edit.' }
    if (String(e.file_path).endsWith('broken.ts')) return { result: 'old_string not found', isError: true }
    // A Bash command with "--fail" in it ends with an error, as a non-zero exit does.
    if (e.tool === 'Bash' && String(e.command).includes('--fail')) return { result: 'exit 1', isError: true }
    if (e.tool === 'Bash') onBash?.(String(e.command))
    return { result: 'ok' }
  })
  const listed = Object.fromEntries(Object.entries(dirs).map(([d, kids]) => [key(d), kids]))
  const lists: string[] = []
  on('fs.list', (_$: any, e: any) => {
    lists.push(key(e.path))
    const kids = listed[key(e.path)]
    if (!kids) throw new Error(`ENOENT ${e.path}`)
    return { value: kids.map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  const ran: string[][] = []
  on('process.run', (_$: any, e: any) => {
    const argv: string[] = e.argv
    ran.push(argv)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    // Openers (cmd /c start, open, xdg-open) succeed; uname says Linux.
    if (argv[0] === 'uname') return out('Linux\n')
    if (argv[0] !== 'git') return out('')
    if (!git) return out('', 128)
    if (argv[1] === 'rev-parse') return out(`${git.top}\n`)
    if (argv[1] === 'status') return out(git.status)
    if (argv[1] === 'diff') return out(git.numstat)
    if (argv[1] === 'ls-files') return out(git.lsFiles ?? '')
    if (argv[1] === 'show') return out(git.show ?? '')
    // check-ignore names the paths it was given that git ignores: exit 1 when none is.
    if (argv[1] === 'check-ignore') return out(git.ignored ?? '', git.ignored ? 0 : 1)
    return out('', 1)
  })
  const scrolls: unknown[] = []
  on('ui.scroll', (_$: any, e: any) => {
    scrolls.push(e)
    return {}
  })
  const logs: string[] = []
  on('ui.log', (_$: any, e: any) => {
    logs.push(String(e.text))
    return { value: undefined }
  })
  const copies: { text: string; surface?: string }[] = []
  // ui.copy takes { value }, unlike ui.scroll and prompt.fill, which take their result bare.
  on('ui.copy', (_$: any, e: any) => {
    copies.push({ text: e.text, surface: e.surface })
    return { value: { isCopied: true } }
  })
  return { history, states, store, clock, lists, ran, scrolls, logs, writes, fills, toasts, opens, closes, copies, listed }
}

/** Text with the non-breaking spaces the mod draws (indents, diff lines, narrow ones in a row) read as plain ones. */
export const plain = (text: string | undefined) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

/** The text of the element drawn under `key`, spaces plain; '' when it is not drawn. */
export async function rowText(ui: any, key: string): Promise<string> {
  const el = await ui.find({ key })
  if (el?.type === 'Client') return plain(textOf(await ui.drawn({ in: key })))
  return plain(el?.text)
}

/** All the text in a drawn tree, in order (a Client's module tree, read through `drawn`). */
export function textOf(node: any): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.props?.children ?? node.children)
}

/** The Text runs a row's Client drew, with their props: colours and styles under test. */
export async function rowRuns(ui: any, key: string): Promise<{ text: string; props: any }[]> {
  const out: { text: string; props: any }[] = []
  const walk = (n: any) => {
    if (n == null || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    // Every Text, outer ones first: a wrapped title is one Text holding its runs.
    if (n.type === 'Text') out.push({ text: plain(textOf(n)), props: n.props ?? {} })
    walk(n.props?.children ?? n.children)
  }
  walk(await ui.drawn({ in: key }))
  return out
}

/** Whether a Text reading `text` (spaces plain) is drawn. */
export async function hasText(ui: any, text: string): Promise<boolean> {
  return (await ui.findAll({ type: 'Text' })).some((t: any) => plain(t.text) === text)
}

export const PANE = {
  component: 'Pane',
  requestId: 'filetrail',
  props: {
    title: 'Trail: demo',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

/** Presses a tree row as its Client does: a post from that row's instance. */
export async function pressRow(ui: any, key: string): Promise<void> {
  await ui.post({ press: true }, { in: key })
}
