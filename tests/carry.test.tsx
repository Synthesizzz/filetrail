// What History keeps when the session or the folder changes. History is stored per cwd,
// so a session that starts in the same folder finds it and one that starts in any other
// folder starts empty, and can bring another folder's with /trail bring.

const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

import { expect, test } from './kit'

import type { Turn } from '../types'
import { projectKey } from '../hooks/history'
import { DONE, KEY, START, world } from './world'

const DEMO = 'C:\\work\\demo'
const FILES = { [`${DEMO}\\a.ts`]: 'x\ngreet()\n', [`${DEMO}\\src\\b.ts`]: 'y\ngreet()\n' }
const edit = (file: string) => ({ tool: 'Edit' as const, file_path: file, old_string: 'greet', new_string: 'welcome' })

/**
 * `on` for `world`, with `session.cwd` answered from `cur.cwd`: a test moves it between
 * session starts. (world answers one fixed folder, and registers session.start itself.)
 */
function movable(on: any, first: string) {
  const cur = { cwd: first }
  const hooked: any = (name: string, ...rest: unknown[]) => (name === 'session.cwd' ? on(name, () => ({ value: cur.cwd })) : on(name, ...rest))
  return { cur, hooked: Object.assign(hooked, on) }
}

/** What the first process of test b leaves on disk, for the second to find. */
let onDisk: Record<string, unknown> = {}

/** One finished turn editing `file`, then the turns History shows. */
async function work($: any, id: string, file: string) {
  await $.turn.start({ text: `edit ${id}`, turnId: id })
  await $.tool.call(edit(file))
  await $.turn.complete({ ...DONE, turnId: id })
}

const shown = (history: Turn[][]) => history.at(-1)!.map(t => t.id)

test('a: /clear fires no session.start, so the module, its state and the store go on as they were', async ($, on) => {
  // Engine docs (SessionEndInput.reason): "`clear` ... the process goes on under a new
  // session id, and no `session.start` fires for it". filetrail has no session.end hook.
  // So nothing is reloaded: the running module keeps `root` and the history atom.
  const { history, store } = world(on, { files: FILES })
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  expect(shown(history)).toEqual(['t1'])
  expect((store.get(KEY) as Turn[]).map(t => t.id)).toEqual(['t1'])
  // (No event is raised here: the real /clear raises none that filetrail hooks.)
  await work($, 't2', `${DEMO}\\a.ts`)
  expect(shown(history)).toEqual(['t1', 't2'])
})

test('a2: if session.start did fire again in the same cwd, History reloads whole from the store', async ($, on) => {
  const { history, store, states } = world(on, { files: FILES })
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  await work($, 't2', `${DEMO}\\a.ts`)
  await $.session.start(START)
  expect(shown(history)).toEqual(['t1', 't2'])
  expect((store.get(KEY) as Turn[]).length).toBe(2)
  // What a second start does reset: the Now row (live), the stage, working, helpers.
  expect(states.live!.at(-1)).toBe(null)
})

test('a3: a turn running when session.start fires again still ends up saved, only its Now row disappears until the next tool call', async ($, on) => {
  const { history, states } = world(on, { files: FILES })
  await $.session.start(START)
  await $.turn.start({ text: 'edit t1', turnId: 't1' })
  await $.tool.call(edit(`${DEMO}\\a.ts`))
  expect((states.live!.at(-1) as Turn).id).toBe('t1')
  await $.session.start(START)
  expect(states.live!.at(-1)).toBe(null)
  await $.turn.complete({ ...DONE, turnId: 't1' })
  expect(shown(history)).toEqual(['t1'])
})

test('b1: a process works in a folder; its store is what is left on disk', async ($, on) => {
  const { store } = world(on, { files: FILES })
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  onDisk = Object.fromEntries(store)
  expect(Object.keys(onDisk).sort()).toEqual(['index', KEY].sort())
})

test('b2: a new process in the same cwd (fresh module, fresh state, the store as left) shows the earlier turns', async ($, on) => {
  // The store is "kept between sessions": a JSON file of the plugin's own. Runs after b1.
  expect(Object.keys(onDisk).length).toBeGreaterThan(0)
  const { history } = world(on, { files: FILES, stored: onDisk })
  await $.session.start(START)
  expect(shown(history)).toEqual(['t1'])
})

test('c: the same repo from a worktree path starts with no History of its own, and can bring the repo\'s', async ($, on) => {
  const { cur, hooked } = movable(on, DEMO)
  const { history, store, states } = world(hooked, {
    files: { ...FILES, 'C:\\work\\demo-wt\\a.ts': 'x\ngreet()\n' },
    git: { top: 'C:/work/demo-wt', status: '## main\0', numstat: '' },
  })
  cur.cwd = DEMO
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  expect(Object.keys(Object.fromEntries(store)).sort()).toEqual(['index', KEY].sort())

  // The worktree of the same repo: another folder, same history on disk, but under another key.
  cur.cwd = 'C:\\work\\demo-wt'
  await $.session.start({ ...START, cwd: cur.cwd })
  expect(history.at(-1)).toEqual([])
  expect(projectKey('C:\\work\\demo-wt')).not.toBe(KEY)
  // It can be brought: /trail bring offers the folder of the same repo first, and shows its turns here.
  expect((await $.command.run({ ...TYPED, command: 'trail', args: 'bring' })).text).toContain('1. demo')
  await $.command.run({ ...TYPED, command: 'trail', args: 'bring 1' })
  expect((states.brought!.at(-1) as any).turns.map((t: Turn) => t.id)).toEqual(['t1'])
  // Its own first turn is saved under its own key, beside the link; the origin keeps its own.
  await work($, 't2', 'C:\\work\\demo-wt\\a.ts')
  expect(Object.keys(Object.fromEntries(store)).sort()).toEqual(['b:c:/work/demo-wt', 'index', KEY, 'p:c:/work/demo-wt'].sort())
  expect(shown(history)).toEqual(['t2'])
  expect((store.get(KEY) as Turn[]).map(t => t.id)).toEqual(['t1'])
})

test('c2: a worktree folder made inside the repo folder is a project of its own, not part of the repo\'s', async ($, on) => {
  const { cur, hooked } = movable(on, DEMO)
  const { history } = world(hooked, { files: FILES })
  cur.cwd = DEMO
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  // Claude Code's desktop app makes worktrees at <repo>/.claude/worktrees/<name>.
  cur.cwd = `${DEMO}\\.claude\\worktrees\\x1`
  await $.session.start({ ...START, cwd: cur.cwd })
  expect(history.at(-1)).toEqual([])
})

test('d: from a subfolder of the repo History starts empty, and an edit above the subfolder is recorded', async ($, on) => {
  const { cur, hooked } = movable(on, DEMO)
  const { history, store } = world(hooked, { files: FILES, git: { top: 'C:/work/demo', status: '## main\0', numstat: '' } })
  cur.cwd = DEMO
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)

  cur.cwd = `${DEMO}\\src`
  await $.session.start({ ...START, cwd: cur.cwd })
  expect(history.at(-1)).toEqual([])
  // An edit inside the subfolder is kept under the subfolder's key ...
  await work($, 't2', `${DEMO}\\src\\b.ts`)
  expect(store.has('p:c:/work/demo/src')).toBe(true)
  // ... and one above it (a.ts, in the repo but outside the cwd) too: the bound is the repo's top,
  // named from there.
  await work($, 't3', `${DEMO}\\a.ts`)
  expect(shown(history)).toEqual(['t2', 't3'])
  expect(history.at(-1)!.at(-1)!.steps.map(s => s.rel)).toEqual(['a.ts'])
})

test('d2: outside git the bound stays the folder: an edit above it is still not recorded', async ($, on) => {
  const { cur, hooked } = movable(on, `${DEMO}\\src`)
  const { history } = world(hooked, { files: FILES })
  cur.cwd = `${DEMO}\\src`
  await $.session.start({ ...START, cwd: cur.cwd })
  await work($, 't1', `${DEMO}\\a.ts`)
  expect(history.at(-1)).toEqual([])
})

test('e: a folder renamed or moved starts empty; a different spelling of the same folder does not', async ($, on) => {
  const { cur, hooked } = movable(on, DEMO)
  const { history } = world(hooked, { files: FILES })
  cur.cwd = DEMO
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)

  for (const same of ['C:\\work\\demo\\', 'c:/work/demo', 'C:\\WORK\\Demo']) {
    cur.cwd = same
    await $.session.start({ ...START, cwd: same })
    expect(shown(history)).toEqual(['t1'])
  }
  // The key is only the path: another drive letter, a rename, a WSL or Git Bash spelling all miss.
  for (const other of ['C:\\work\\demo2', 'D:\\work\\demo', '/mnt/c/work/demo', '/c/work/demo']) {
    cur.cwd = other
    await $.session.start({ ...START, cwd: other })
    expect(history.at(-1)).toEqual([])
  }
})

test('e2: moving the folder back makes the old History reappear: nothing was deleted, it was only under another key', async ($, on) => {
  const { cur, hooked } = movable(on, DEMO)
  const { history } = world(hooked, { files: FILES })
  cur.cwd = DEMO
  await $.session.start(START)
  await work($, 't1', `${DEMO}\\a.ts`)
  cur.cwd = 'C:\\work\\elsewhere'
  await $.session.start({ ...START, cwd: cur.cwd })
  expect(history.at(-1)).toEqual([])
  cur.cwd = DEMO
  await $.session.start(START)
  expect(shown(history)).toEqual(['t1'])
})
