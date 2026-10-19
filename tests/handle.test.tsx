import { expect, test } from 'claude-code/testing'

import { dragRows } from '../hooks/handle'
import { PANE, START, world } from './world'

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

test('the card\'s handle, dragged down, shows more touched files and, dragged up, fewer; the size is kept', async ($, on) => {
  const { clock, store } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) await $.tool.call({ tool: 'Read', file_path: `C:\\work\\demo\\${n}.md` } as never)
  await clock.advance(200)
  expect(await ui.find({ key: 'card-handle' })).toBeDefined()
  expect(await touchedRows(ui)).toBe(3)

  // Down two rows: five files.
  await ui.pointer({ in: 'card-handle', type: 'down', x: 10, y: 0, button: 'left' })
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: 2, button: 'left' })
  await clock.advance(50)
  expect(await touchedRows(ui)).toBe(5)
  // Past the most there are: all six; up past none: none.
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: 9, button: 'left' })
  await clock.advance(50)
  expect(await touchedRows(ui)).toBe(6)
  await ui.pointer({ in: 'card-handle', type: 'move', x: 10, y: -9, button: 'left' })
  await clock.advance(50)
  expect(await touchedRows(ui)).toBe(0)
  // Let go at one row: kept for the next session.
  await ui.pointer({ in: 'card-handle', type: 'up', x: 10, y: -2, button: 'left' })
  await clock.advance(50)
  expect(await touchedRows(ui)).toBe(1)
  expect(store.get('filetrail:touchedRows')).toBe(1)
  await ui.unmount()
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
