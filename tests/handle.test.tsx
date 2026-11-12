import { expect, test } from './kit'

import { dragRows, previewText } from '../hooks/handle'
import { REVEAL_MS, REVEAL_STEPS, revealRuns } from '../hooks/row'
import { PANE, START, rowText, world } from './world'

test('dragRows: rows follow the drag, kept between none and the most there are', () => {
  expect(dragRows(3, 2, 8)).toBe(5)
  expect(dragRows(3, -2, 8)).toBe(1)
  expect(dragRows(3, -9, 8)).toBe(0)
  expect(dragRows(3, 20, 6)).toBe(6)
  expect(dragRows(3, 1.4, 8)).toBe(4)
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'].map(n => [n, 'file'] as [string, 'file']),
}
const FILES = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(n => [`C:\\work\\demo\\${n}.md`, `${n}\n`]))
const touchedRows = async (ui: any) => (await ui.findAll({ type: 'Client' })).filter((c: any) => String(c.key).startsWith('touched-')).length

test('the card\'s handle, held and dragged, previews the size on its bar; let go, the list takes it and keeps it', async ($, on) => {
  const { clock, store } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await $.tool.call({ tool: 'Read', file_path: `C:/work/demo/${n}.md` } as never)
  await clock.advance(200)
  expect(await ui.find({ key: 'card-handle' })).toBeDefined()
  expect(await touchedRows(ui)).toBe(3)

  // Held, down two rows: the bar previews five files and the two it adds; the list waits.
  await ui.resize({ columns: 60, rows: 1, in: 'card-handle' })
  await ui.pointer({ in: 'card-handle', type: 'down', x: 10, y: 0, button: 'left' })
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: 2, button: 'left' })
  await clock.advance(50)
  expect(await rowText(ui, 'card-handle')).toContain('▼ 5 files · + c.md, b.md')
  expect(await touchedRows(ui)).toBe(3)
  // Up past none: the bar says so.
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: -9, button: 'left' })
  expect(await rowText(ui, 'card-handle')).toContain('▲ 0 files · − 3')
  // Let go at one row: the list takes it, kept for the next session.
  await ui.pointer({ in: 'card-handle', type: 'up', x: 10, y: -2, button: 'left' })
  await clock.advance(50)
  expect(await touchedRows(ui)).toBe(1)
  expect(store.get('filetrail:touchedRows')).toBe(1)
  await ui.unmount()
})

test('previewText: the size it comes to, and what it adds or takes away', () => {
  const names = ['f.md', 'e.md', 'd.md', 'c.md', 'b.md']
  expect(previewText(3, 5, names)).toBe('▼ 5 files · + c.md, b.md')
  expect(previewText(3, 1, names)).toBe('▲ 1 file · − 2')
  expect(previewText(3, 3, names)).toBe('3 files')
})

test('the size left by the handle comes back in the next session', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, stored: { 'filetrail:touchedRows': 5 } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await $.tool.call({ tool: 'Read', file_path: `C:\\work\\demo\\${n}.md` } as never)
  await clock.advance(200)
  expect(await touchedRows(ui)).toBe(5)
  await ui.unmount()
})

test('revealRuns: the first letters show, the rest are spaces of the same width', () => {
  const segs = [{ t: ' MD ' }, { t: ' notes.md', name: true }]
  expect(revealRuns(segs, 6).map(s => s.t).join('')).toBe(' MD  n' + '\u00a0'.repeat(7))
  expect(revealRuns(segs, 0).map(s => s.t).join('').length).toBe(13)
  expect(revealRuns(segs, 99)).toEqual(segs)
})

test('a touched file let in by the handle types itself in, then shows whole', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await $.tool.call({ tool: 'Read', file_path: `C:/work/demo/${n}.md` } as never)
  await clock.advance(1000)
  // Newest first: the fourth row is c.md, hidden until the handle lets it in.
  await ui.pointer({ in: 'card-handle', type: 'down', x: 10, y: 0, button: 'left' })
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: 1, button: 'left' })
  await ui.pointer({ in: 'card-handle', type: 'up', x: 10, y: 1, button: 'left' })
  await clock.advance(50)
  const key = 'touched-c:/work/demo/c.md'
  const early = await rowText(ui, key)
  expect(early.includes('c.md')).toBe(false)
  await ui.advance(REVEAL_MS * (REVEAL_STEPS + 1))
  expect(await rowText(ui, key)).toMatch(/c\.md/)
  await ui.unmount()
})
