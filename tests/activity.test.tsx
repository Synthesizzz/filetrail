import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { FLASH_MS, HOLD_MS, MIN_TREE_ROWS, clampTop, foldersTo, glide, targetOf, topFor, treeLines, treeRows, treeWindow } from '../hooks/activity'
import { READ_COLOR, SELECTED_BG, TONE_COLOR, TONE_SHIMMER } from '../hooks/files-view'
import { BAND_STEP, shimmer, TICK_MS } from '../hooks/row'
import { DONE, KEY, PANE, START, pressRow, rowRuns, rowText, world } from './world'

test('each tone paints with a colour the desktop draws (not the permission theme key)', () => {
  // Seen live: the desktop drew "· reading" in plain text with `permission`.
  expect(TONE_COLOR.read).toBe(READ_COLOR)
  expect(TONE_COLOR.read).not.toBe('permission')
  expect(TONE_COLOR.write).toBe('claude')
  expect(TONE_COLOR.commit).toBe('success')
})

test('shimmer: brightest under the band, base far from it', () => {
  const p = ['a', 'b', 'c', 'd']
  // phase 16 puts the band at 16 * 0.5 - 4 = 4 for a 10-letter run.
  expect(BAND_STEP).toBe(0.5)
  expect(shimmer(4, 16, 10, p)).toBe('d')
  expect(shimmer(3, 16, 10, p)).toBe('c')
  expect(shimmer(2, 16, 10, p)).toBe('b')
  expect(shimmer(9, 16, 10, p)).toBe('a')
  // A short step on a short tick: a smooth band, slower than the 1.6 letters a 90 ms tick took.
  expect(TICK_MS).toBe(45)
})

/** The colour of each letter a row's shimmering runs drew, in order. */
async function letterColors(ui: any, key: string): Promise<string[]> {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    const kids = n.props?.children ?? n.children
    // A drawn tree carries children as an array: one letter is ['R'].
    const letter = Array.isArray(kids) && kids.length === 1 && typeof kids[0] === 'string' ? kids[0] : kids
    if (n.type === 'Text' && typeof letter === 'string' && [...letter].length === 1 && n.props?.color) out.push(n.props.color)
    else walk(kids)
  }
  walk(await ui.drawn({ in: key }))
  return out
}

test('a lit name shimmers: the band moves on the row\'s own clock, and stops once the turn ends', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\README.md' })
  await clock.advance(200)
  const key = rowKey('C:/work/demo/README.md')
  const before = await letterColors(ui, key)
  expect(before.length).toBe('README.md'.length + ' · reading'.length)
  expect(before.every(c => TONE_SHIMMER.read.includes(c))).toBe(true)
  await ui.advance(TICK_MS * 3)
  expect(await letterColors(ui, key)).not.toEqual(before)
  // Still shimmering past a search's fade: Claude is still on this file.
  await clock.advance(FLASH_MS + 100)
  expect(await letterColors(ui, key)).not.toEqual([])
  await $.turn.complete({ ...DONE, turnId: 't0' })
  await clock.settle()
  expect(await letterColors(ui, key)).toEqual([])
  await ui.unmount()
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['deep', 'dir'], ['a.ts', 'file']],
  'C:/work/demo/src/deep': [['x.ts', 'file']],
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const X = 'C:/work/demo/src/deep/x.ts'

test('targetOf: reads and writes are followed, a search only lights up', () => {
  expect(targetOf({ tool: 'Read', file_path: 'C:\\w\\a.ts' })).toEqual({ path: 'C:/w/a.ts', tone: 'read', follow: true })
  expect(targetOf({ tool: 'Write', file_path: '/w/a.ts' })).toEqual({ path: '/w/a.ts', tone: 'write', follow: true })
  expect(targetOf({ tool: 'NotebookEdit', notebook_path: '/w/n.ipynb' })?.tone).toBe('write')
  expect(targetOf({ tool: 'Grep', pattern: 'x', path: '/w/src' })).toEqual({ path: '/w/src', tone: 'read', follow: false })
  expect(targetOf({ tool: 'Grep', pattern: 'x' })).toBe(null)
  expect(targetOf({ tool: 'Bash', command: 'cat a.ts' })).toBe(null)
})

test('treeRows gives the tree what the pane has under its head, a few rows at least', () => {
  expect(treeRows(29, 12)).toBe(17)
  expect(treeRows(10, 12)).toBe(MIN_TREE_ROWS)
})

test('clampTop keeps the window inside the tree', () => {
  expect(clampTop(-3, 50, 10)).toBe(0)
  expect(clampTop(45, 50, 10)).toBe(40)
  expect(clampTop(5, 8, 10)).toBe(0)
})

test('topFor leaves a row already well in view, else puts it mid-window', () => {
  expect(topFor(15, 100, 20, 10)).toBe(10)
  expect(topFor(60, 100, 20, 10)).toBe(50)
  expect(topFor(11, 100, 20, 10)).toBe(1)
  expect(topFor(98, 100, 20, 0)).toBe(80)
})

test('treeWindow: the rows on show, with a line for what lies above and below', () => {
  // All fit: no marker lines.
  expect(treeWindow(5, 0, 10)).toEqual({ top: 0, start: 0, end: 5, above: 0, below: 5 - 5 })
  // At the top of a long tree: the last row of room says how many are below.
  expect(treeWindow(50, 0, 10)).toEqual({ top: 0, start: 0, end: 9, above: 0, below: 41 })
  // In the middle: a line each way.
  expect(treeWindow(50, 20, 10)).toEqual({ top: 20, start: 20, end: 28, above: 20, below: 22 })
  // At the end: nothing hidden below, the last row shows.
  expect(treeWindow(50, 99, 10)).toEqual({ top: 41, start: 41, end: 50, above: 41, below: 0 })
  expect(treeLines(treeWindow(50, 20, 10))).toBe(10)
  expect(treeLines(treeWindow(5, 0, 10))).toBe(5)
})

test('glide eases from one top to another, ending on it', () => {
  expect(glide(0, 40)).toEqual([18, 30, 38, 40])
  expect(glide(40, 0)).toEqual([22, 10, 2, 0])
  expect(glide(5, 5)).toEqual([])
  expect(glide(0, 1)).toEqual([1])
})

test('foldersTo lists the folders down to a file, null outside the root', () => {
  expect(foldersTo('C:\\work\\demo', 'C:/work/demo/src/deep/x.ts')).toEqual(['C:/work/demo/src', 'C:/work/demo/src/deep'])
  expect(foldersTo('C:/work/demo', 'c:/WORK/demo/README.md')).toEqual([])
  expect(foldersTo('C:/work/demo', 'D:/other/a.ts')).toBe(null)
})

// The scroll to the row is not checked here: a scroll the mod asks for of its own
// pane is not answered by the test's hooks ("no implementation for ui.scroll"),
// so it is checked in the app.
test('a Read lights its row and opens the tree down to it, then fades', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  // The pane is up first, as in the app: the row can only be scrolled to once drawn.
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' })
  await clock.advance(200)

  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts · reading$/)
  expect((await rowRuns(ui, rowKey(X))).find(r => r.text === 'x.ts')?.props.color).toBe(READ_COLOR)
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▾ ■ src\//)

  // The file Claude is on stays lit past the fade of a search's light, until it moves on.
  await clock.advance(FLASH_MS + 1000)
  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts · reading$/)

  // Touching another file moves the light there at once, and folds the folders not on its way.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\a.ts' })
  await clock.advance(200)
  // deep led only to x.ts: Claude has moved on, so it folds and x.ts is not drawn.
  expect(await ui.find({ key: rowKey(X) })).toBeUndefined()
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/a\.ts · reading$/)

  // The turn ends: the light goes out, and a quiet ◂ stays on the last file touched.
  await $.turn.complete({ ...DONE, turnId: 't0' })
  await clock.settle()
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/a\.ts ◂$/)
  await ui.unmount()
})

test('the file Claude is on stops shimmering on its own after a long while', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' })
  // No turn end ever comes (the session was cut off): the light still goes out.
  await clock.advance(HOLD_MS + 100)
  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts ◂$/)
  await ui.unmount()
})

test('a Write lights up once it went through; a denied one does not', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ text: 'w', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\README.md', content: 'x\n' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\src\\denied.ts', old_string: 'a', new_string: 'b' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // The running turn's edits count at once (●1), before the turn is saved.
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toMatch(/README\.md · writing ●1$/)
  // The name and the word carry the tone's colour, drawn by the row's Client.
  const runs = await rowRuns(ui, rowKey('C:/work/demo/README.md'))
  expect(runs.find(r => r.text === 'README.md')?.props).toMatchObject({ color: 'claude', weight: 'semibold' })
  expect(runs.find(r => r.text === ' · writing')?.props.color).toBe('claude')
  await ui.unmount()
})

test('a search lights a folder on show without opening it', async ($, on) => {
  const { clock, scrolls } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  await $.tool.call({ tool: 'Grep', pattern: 'greet', path: 'C:\\work\\demo\\src' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▸ ■ src\/ · reading$/)
  expect(scrolls).toEqual([])
  // A search's light fades on its own, turn or no turn.
  await clock.advance(FLASH_MS + 100)
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).not.toMatch(/reading/)
  await ui.unmount()
})

const EDITED: Turn[] = [{
  id: 't1', at: 1, prompt: 'edit a',
  steps: [1, 2].map(n => ({
    id: `t1.${n}`, path: 'C:/work/demo/src/a.ts', rel: 'src/a.ts', tool: 'Edit', note: '', status: 'ok' as const,
    line: n, add: 1, del: 1, diff: [{ op: '+' as const, t: `line ${n}` }], at: 1,
  })),
}]

test('Files to History and back: a file\'s history, then Show in Files', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, stored: { [KEY]: EDITED } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  await pressRow(ui, rowKey('C:/work/demo/src'))
  await pressRow(ui, rowKey('C:/work/demo/src/a.ts'))
  expect(await rowText(ui, 'file-history')).toBe('History 2')
  await ui.press({ key: 'file-history' })
  expect(await ui.find({ type: 'Text', text: 'src/a.ts · 2 edits across 1 turn' })).toBeDefined()

  // Close src, then come back to the file from History: the tree opens to it, selected.
  await ui.press({ key: 'tab-files' })
  await pressRow(ui, rowKey('C:/work/demo/src'))
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeUndefined()
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'reveal' })
  await clock.settle()
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeDefined()
  // Selected: bold, and its row filled.
  const name = (await rowRuns(ui, rowKey('C:/work/demo/src/a.ts'))).find(r => r.text === 'a.ts')
  expect(name?.props.weight).toBe('semibold')
  expect(((await ui.find({ key: rowKey('C:/work/demo/src/a.ts') }))?.props as any)?.props?.bg).toBe(SELECTED_BG)
  await ui.unmount()
})
