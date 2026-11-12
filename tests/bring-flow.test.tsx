// Bringing History from another folder of the same repo, as the person does it: /trail bring
// lists the folders, a number or the empty page's Bring button shows the origin's turns here
// without copying a byte, Keep moves them for good, /trail unbring takes them back.

import { expect, test } from './kit'

import type { Turn } from '../types'
import { byteSize, linkKey, projectKey } from '../hooks/history'
import { DONE, PANE, START, hasText, plain, pressRow, world } from './world'

const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const MAIN = 'C:\\work\\demo'
const WT = 'C:\\work\\demo\\.claude\\worktrees\\wt1'
const MAIN_KEY = 'p:c:/work/demo'
const WT_KEY = projectKey(WT)
const GIT = { top: 'C:/work/demo/.claude/worktrees/wt1', common: 'C:/work/demo/.git', status: '## main\0', numstat: '' }

const turn = (id: string, at: number, over: Partial<Turn> = {}): Turn => ({
  id, at, prompt: `prompt ${id}`,
  steps: [{ id: `${id}.0.0`, path: 'C:/work/demo/a.ts', rel: 'a.ts', tool: 'Edit', note: '', line: 1, at, status: 'ok', add: 1, del: 1, diff: [{ op: '-', t: 'a' }, { op: '+', t: 'b' }] }],
  ...over,
})
const ORIGIN = [turn('g1', 1_000), turn('g2', 2_000), turn('g3', 3_000)]

/** `on` for `world` with `session.cwd` answered from `cur.cwd`, so a test can move between folders. */
function movable(on: any, first: string) {
  const cur = { cwd: first }
  const hooked: any = (name: string, ...rest: unknown[]) => (name === 'session.cwd' ? on(name, () => ({ value: cur.cwd })) : on(name, ...rest))
  return { cur, hooked: Object.assign(hooked, on) }
}

/** A session in the worktree, with the main checkout's History in the store (and a folder of another repo). */
async function inWorktree($: any, on: any, extra: { stored?: Record<string, unknown>; files?: Record<string, string> } = {}) {
  const { cur, hooked } = movable(on, WT)
  const stored = {
    [MAIN_KEY]: ORIGIN,
    'p:d:/other': [turn('x1', 500)],
    index: { [MAIN_KEY]: { used: 5_000, bytes: byteSize(ORIGIN) }, 'p:d:/other': { used: 9_000, bytes: 100 } },
    ...extra.stored,
  }
  const w = world(hooked, { stored, git: GIT, files: { [`${WT}\\a.ts`]: 'a\n', ...extra.files } })
  await $.session.start({ ...START, cwd: WT })
  return { ...w, cur }
}

const bring = ($: any, args: string) => $.command.run({ ...TYPED, command: 'trail', args })
const pBytes = (store: Map<string, unknown>) => [...store].filter(([k]) => k.startsWith('p:')).reduce((n, [, v]) => n + byteSize(v), 0)

test('/trail bring lists the folders with History, this repo\'s first, and a number picks one', async ($, on) => {
  const { store } = await inWorktree($, on)
  const listed = plain((await bring($, 'bring')).text)
  expect(listed).toContain('1. demo')
  expect(listed).toContain('this repo')
  expect(listed.indexOf('demo')).toBeLessThan(listed.indexOf('other'))
  expect(listed).toContain('/trail bring 1')
  // Listing changes nothing.
  expect(store.has(linkKey(WT_KEY))).toBe(false)
})

test('bringing shows the origin\'s turns here, marked, without copying a byte or touching the origin', async ($, on) => {
  const { store, states } = await inWorktree($, on)
  const before = JSON.stringify(store.get(MAIN_KEY))
  const bytes = pBytes(store)
  await bring($, 'bring')
  const r = plain((await bring($, 'bring 1')).text)
  expect(r).toContain('brought 3 turns from')
  expect(r).toContain('/trail bring keep')
  expect(r).toContain('/trail unbring')
  expect(JSON.stringify(store.get(MAIN_KEY))).toBe(before)
  expect(pBytes(store)).toBe(bytes)
  expect(store.has(WT_KEY)).toBe(false)
  expect(store.get(linkKey(WT_KEY))).toMatchObject({ key: MAIN_KEY, kept: false })
  expect((store.get('index') as any)[MAIN_KEY].heldBy).toBe(WT_KEY)
  const shown = states.brought!.at(-1) as any
  expect(shown.turns.map((t: Turn) => t.id)).toEqual(['g1', 'g2', 'g3'])
  expect(shown.turns.every((t: Turn) => t.from === 'c:/work/demo')).toBe(true)

  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  expect(await hasText(ui, '↪ 3 turns from demo')).toBe(true)
  expect(await ui.find({ key: 'bring-keep' })).toBeDefined()
  expect(await ui.find({ key: 'bring-undo' })).toBeDefined()
  await ui.unmount()
})

test('the empty History page has a Bring button for each folder it names', async ($, on) => {
  const { store } = await inWorktree($, on)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  expect(await hasText(ui, 'No edits recorded yet.')).toBe(true)
  await ui.press({ key: 'bring-0' })
  expect(store.get(linkKey(WT_KEY))).toMatchObject({ key: MAIN_KEY })
  expect(await hasText(ui, '↪ 3 turns from demo')).toBe(true)
  await ui.unmount()
})

test('/trail unbring before Keep drops only the link: the origin is as it was', async ($, on) => {
  const { store, states } = await inWorktree($, on)
  const before = JSON.stringify(store.get(MAIN_KEY))
  await bring($, 'bring')
  await bring($, 'bring 1')
  const r = plain((await bring($, 'unbring')).text)
  expect(r).toContain('3 turns')
  expect(store.has(linkKey(WT_KEY))).toBe(false)
  expect(JSON.stringify(store.get(MAIN_KEY))).toBe(before)
  expect((store.get('index') as any)[MAIN_KEY].heldBy).toBeUndefined()
  expect(states.brought!.at(-1)).toBe(null)
  expect(plain((await bring($, 'unbring')).text)).toContain('nothing')
})

test('Keep moves the turns here with their mark and removes them from the origin', async ($, on) => {
  const { store, history } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  const r = plain((await bring($, 'bring keep')).text)
  expect(r).toContain('kept 3 turns')
  expect((store.get(WT_KEY) as Turn[]).map(t => `${t.id}:${t.from}`)).toEqual(['g1:c:/work/demo', 'g2:c:/work/demo', 'g3:c:/work/demo'])
  expect(store.has(MAIN_KEY)).toBe(false)
  expect((store.get('index') as any)[MAIN_KEY]).toBeUndefined()
  expect(store.get(linkKey(WT_KEY))).toMatchObject({ kept: true })
  expect(history.at(-1)!.map(t => t.id)).toEqual(['g1', 'g2', 'g3'])
  // A second Keep has nothing waiting.
  expect(plain((await bring($, 'bring keep')).text)).toContain('nothing')
})

test('Keep past 50 turns leaves the oldest with the origin, and says so', async ($, on) => {
  const own = Array.from({ length: 10 }, (_, k) => turn(`o${k}`, 100_000 + k))
  const origin = Array.from({ length: 45 }, (_, k) => turn(`g${k}`, 1_000 + k))
  const { store } = await inWorktree($, on, { stored: { [WT_KEY]: own, [MAIN_KEY]: origin, index: { [WT_KEY]: { used: 9, bytes: byteSize(own) }, [MAIN_KEY]: { used: 5, bytes: byteSize(origin) } } } })
  await bring($, 'bring')
  await bring($, 'bring 1')
  const r = plain((await bring($, 'bring keep')).text)
  expect(r).toContain('kept 40 turns')
  expect(r).toContain('5 older stay')
  expect((store.get(WT_KEY) as Turn[]).length).toBe(50)
  expect((store.get(MAIN_KEY) as Turn[]).map(t => t.id)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4'])
  expect((store.get('index') as any)[MAIN_KEY].heldBy).toBeUndefined()
})

test('/trail unbring after Keep moves the kept turns back to the origin, unmarked', async ($, on) => {
  const { store, history } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  await bring($, 'bring keep')
  const r = plain((await bring($, 'unbring')).text)
  expect(r).toContain('3 turns')
  expect((store.get(MAIN_KEY) as Turn[]).map(t => t.id)).toEqual(['g1', 'g2', 'g3'])
  expect((store.get(MAIN_KEY) as Turn[]).every(t => !('from' in t))).toBe(true)
  expect(store.get(WT_KEY) ?? []).toEqual([])
  expect(store.has(linkKey(WT_KEY))).toBe(false)
  expect(history.at(-1)).toEqual([])
})

test('a turn made while brought turns are on show is saved alone: the brought ones stay the origin\'s', async ($, on) => {
  const { store, states } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  await $.turn.start({ text: 'edit here', turnId: 'n1' })
  await $.tool.call({ tool: 'Edit', file_path: `${WT}\\a.ts`, old_string: 'a', new_string: 'b' })
  await $.turn.complete({ ...DONE, turnId: 'n1' })
  expect((store.get(WT_KEY) as Turn[]).map(t => t.id)).toEqual(['n1'])
  expect((store.get(MAIN_KEY) as Turn[]).length).toBe(3)
  expect((store.get('index') as any)[MAIN_KEY].heldBy).toBe(WT_KEY)
  expect((states.brought!.at(-1) as any).turns.length).toBe(3)
})

test('the link survives a reload, and a link to an origin gone since is dropped without breaking', async ($, on) => {
  const { store, states, logs } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  await $.session.start({ ...START, cwd: WT })
  expect((states.brought!.at(-1) as any).turns.length).toBe(3)
  store.delete(MAIN_KEY)
  await $.session.start({ ...START, cwd: WT })
  expect(states.brought!.at(-1)).toBe(null)
  expect(store.has(linkKey(WT_KEY))).toBe(false)
  expect(logs.some(l => l.includes('no longer'))).toBe(true)
})

test('a session still open in the origin saves from the store, so it does not bring kept turns back', async ($, on) => {
  const { cur, hooked } = movable(on, MAIN)
  const { store } = world(hooked, { stored: { [MAIN_KEY]: ORIGIN, index: { [MAIN_KEY]: { used: 1, bytes: byteSize(ORIGIN) } } }, files: { [`${MAIN}\\a.ts`]: 'a\n' } })
  cur.cwd = MAIN
  await $.session.start({ ...START, cwd: MAIN })
  // Another folder kept these turns: the origin key went, while this session's state still has them.
  store.delete(MAIN_KEY)
  await $.turn.start({ text: 'edit', turnId: 'n1' })
  await $.tool.call({ tool: 'Edit', file_path: `${MAIN}\\a.ts`, old_string: 'a', new_string: 'b' })
  await $.turn.complete({ ...DONE, turnId: 'n1' })
  expect((store.get(MAIN_KEY) as Turn[]).map(t => t.id)).toEqual(['n1'])
})

test('a brought step: Show in Files and View file use the same file in this folder, the card says where it came from', async ($, on) => {
  const { states, toasts } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-g3')
  expect((await ui.findAll({ type: 'Text' })).some((t: any) => plain(t.text).endsWith(' · from demo'))).toBe(true)
  await ui.press({ key: 'reveal' })
  expect((states.files!.at(-1) as any).selected).toBe('C:/work/demo/.claude/worktrees/wt1/a.ts')
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'view-file' })
  expect((states.preview!.at(-1) as any).path).toBe('C:/work/demo/.claude/worktrees/wt1/a.ts')
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('a brought step whose file is in neither folder any more says so instead of failing quietly', async ($, on) => {
  const gone = [turn('g1', 1_000, { steps: [{ ...ORIGIN[0]!.steps[0]!, path: 'C:/work/demo/gone.ts', rel: 'gone.ts' }] })]
  const { toasts, states } = await inWorktree($, on, { stored: { [MAIN_KEY]: gone } })
  await bring($, 'bring')
  await bring($, 'bring 1')
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-g1')
  await ui.press({ key: 'reveal' })
  expect(toasts.at(-1)).toContain('gone.ts')
  expect(toasts.at(-1)).toContain('demo')
  expect(states.tab?.at(-1) ?? 'history').not.toBe('files')
  await ui.unmount()
})

test('/trail clear while turns are on show drops the link too, and leaves the origin alone', async ($, on) => {
  const { store } = await inWorktree($, on)
  await bring($, 'bring')
  await bring($, 'bring 1')
  await bring($, 'clear yes')
  expect(store.has(linkKey(WT_KEY))).toBe(false)
  expect((store.get(MAIN_KEY) as Turn[]).length).toBe(3)
  expect((store.get('index') as any)[MAIN_KEY].heldBy).toBeUndefined()
})
