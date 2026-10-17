import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { FLASH_MS, foldersTo, targetOf } from '../hooks/activity'
import { READ_COLOR, SELECTED_BG, TONE_COLOR, TONE_SHIMMER } from '../hooks/files-view'
import { shimmer, TICK_MS } from '../hooks/row'
import { KEY, PANE, START, pressRow, rowRuns, rowText, world } from './world'

test('each tone paints with a colour the desktop draws (not the permission theme key)', () => {
  // Seen live: the desktop drew "· reading" in plain text with `permission`.
  expect(TONE_COLOR.read).toBe(READ_COLOR)
  expect(TONE_COLOR.read).not.toBe('permission')
  expect(TONE_COLOR.write).toBe('claude')
  expect(TONE_COLOR.commit).toBe('success')
})

test('shimmer: brightest under the band, base far from it', () => {
  const p = ['a', 'b', 'c', 'd']
  // phase 5 puts the band at 5 * 1.6 - 4 = 4 for a 10-letter run.
  expect(shimmer(4, 5, 10, p)).toBe('d')
  expect(shimmer(3, 5, 10, p)).toBe('c')
  expect(shimmer(2, 5, 10, p)).toBe('b')
  expect(shimmer(9, 5, 10, p)).toBe('a')
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

test('a lit name shimmers: the band moves on the row\'s own clock, and stops once it fades', async ($, on) => {
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
  await clock.advance(FLASH_MS + 100)
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

  // Still lit well past the old 2 s, then a quiet ◂ stays on the last file touched.
  await clock.advance(FLASH_MS - 1000)
  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts · reading$/)
  await clock.advance(1100)
  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts ◂$/)

  // Touching another file moves the marker there.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\a.ts' })
  await clock.advance(FLASH_MS + 100)
  expect(await rowText(ui, rowKey(X))).toMatch(/x\.ts$/)
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/a\.ts ◂$/)
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
  expect(runs.find(r => r.text === 'README.md')?.props).toMatchObject({ color: 'claude', bold: true })
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
  expect(await rowText(ui, 'file-history')).toBe('History (2)')
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
  expect(name?.props.bold).toBe(true)
  expect(((await ui.find({ key: rowKey('C:/work/demo/src/a.ts') }))?.props as any)?.props?.bg).toBe(SELECTED_BG)
  await ui.unmount()
})
