import { expect, test } from 'claude-code/testing'

import type { Tool } from '../hooks/tools'
import { CELL, toolAt } from '../hooks/tools'
import { PANE, START, pressRow, rowText, textOf, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['Src', 'dir'], ['.env', 'file'], ['README.md', 'file']],
  'C:/work/demo/Src': [['App.ts', 'file']],
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const SRC = rowKey('C:/work/demo/Src')
const APP = rowKey('C:/work/demo/Src/App.ts')
const README = rowKey('C:/work/demo/README.md')

/** Clicks a toolbar icon as its Client does: a post naming the tool. */
const tool = (ui: any, id: string) => ui.post({ tool: id }, { in: 'tree-tools' })
/** The glyph the toolbar draws for a tool, or undefined when it is not drawn. */
async function glyphOf(ui: any, id: string): Promise<string | undefined> {
  const tools = ((await ui.find({ key: 'tree-tools' }))?.props as any)?.props?.tools as Tool[] | undefined
  return tools?.find(t => t.id === id)?.glyph
}

test('↻ lists the open folders again and reads git again', async ($, on) => {
  const { clock, lists, ran } = world(on, { dirs: DIRS, git: { top: 'C:/work/demo', status: '## main\0', numstat: '' } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, SRC)
  await clock.advance(1000)
  const listedBefore = lists.length
  const statusBefore = ran.filter(a => a[1] === 'status').length
  await tool(ui, 'refresh')
  await clock.settle()
  // The root and the open Src, then git status once more.
  expect(lists.length - listedBefore).toBe(2)
  expect(ran.filter(a => a[1] === 'status').length).toBe(statusBefore + 1)
  await ui.unmount()
})

test('◉ hides dotfiles, ○ shows them again', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const env = rowKey('C:/work/demo/.env')
  expect(await ui.find({ key: env })).toBeDefined()
  expect(await glyphOf(ui, 'dots')).toBe('◉')
  await tool(ui, 'dots')
  expect(await ui.find({ key: env })).toBeUndefined()
  expect(await glyphOf(ui, 'dots')).toBe('○')
  await tool(ui, 'dots')
  expect(await ui.find({ key: env })).toBeDefined()
  await ui.unmount()
})

test('⊟ closes every folder; ⌖ shows only with a selection and opens the tree back to it', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await glyphOf(ui, 'go-selected')).toBeUndefined()
  await pressRow(ui, SRC)
  await pressRow(ui, APP)
  await tool(ui, 'collapse')
  expect(await ui.find({ key: APP })).toBeUndefined()
  expect(await rowText(ui, SRC)).toMatch(/^▸/)
  await tool(ui, 'go-selected')
  await clock.settle()
  expect(await ui.find({ key: APP })).toBeDefined()
  expect(await rowText(ui, SRC)).toMatch(/^▾/)
  await ui.unmount()
})

test('a double-click on a file shows it in the pane; on a folder the second click is let be', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // A folder first: the second click is let be, so it stays open, and nothing is run.
  const before = ran.length
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: SRC })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: SRC })
  await clock.settle()
  expect(await rowText(ui, SRC)).toMatch(/^▾/)
  expect(ran.slice(before).filter(a => a[0] === 'cmd')).toEqual([])

  // Then a file: shown in the pane in place of the tree, nothing run (↗ opens the default app).
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: README })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: README })
  await clock.settle()
  expect(await ui.find({ key: 'preview' })).toBeDefined()
  expect(ran.slice(before).filter(a => a[0] === 'cmd')).toEqual([])
  await ui.unmount()
})

test('a right-click copies the row\'s path from the root; with shift, the whole path', async ($, on) => {
  const { clock, copies } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'right', in: README })
  await clock.settle()
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'right', shift: true, in: SRC })
  await clock.settle()
  expect(copies).toEqual([
    { text: 'README.md', surface: 'desktop' },
    { text: 'C:\\work\\demo\\Src', surface: 'desktop' },
  ])
  // A right-click neither selects nor opens anything.
  expect(await glyphOf(ui, 'go-selected')).toBeUndefined()
  expect(await rowText(ui, SRC)).toMatch(/^▸/)
  await ui.unmount()
})

test('toolAt maps a column to the icon under it, the icons at the right edge', () => {
  // 30 columns, 3 icons of CELL each: they take columns 21 to 29.
  expect(toolAt(20, 30, 3)).toBe(-1)
  expect(toolAt(21, 30, 3)).toBe(0)
  expect(toolAt(21 + CELL, 30, 3)).toBe(1)
  expect(toolAt(29, 30, 3)).toBe(2)
  expect(toolAt(30, 30, 3)).toBe(-1)
})

test('hovering an icon says what it does; a click on it runs it', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.resize({ columns: 40, rows: 1, in: 'tree-tools' })
  // Three icons (no selection): refresh, dots, collapse at columns 31, 34 and 37.
  expect(textOf(await ui.drawn({ in: 'tree-tools' }))).not.toMatch(/dotfiles/)
  await ui.pointer({ type: 'move', x: 34, y: 0, in: 'tree-tools' })
  expect(textOf(await ui.drawn({ in: 'tree-tools' }))).toMatch(/^Hide dotfiles/)
  await ui.pointer({ type: 'move', x: 38, y: 0, in: 'tree-tools' })
  expect(textOf(await ui.drawn({ in: 'tree-tools' }))).toMatch(/^Close all folders/)
  await ui.pointer({ type: 'leave', x: 38, y: 0, in: 'tree-tools' })
  expect(textOf(await ui.drawn({ in: 'tree-tools' }))).not.toMatch(/folders/)
  // A click on the dots icon hides the dotfiles.
  await ui.pointer({ type: 'down', x: 34, y: 0, button: 'left', in: 'tree-tools' })
  await clock.settle()
  expect(await ui.find({ key: rowKey('C:/work/demo/.env') })).toBeUndefined()
  await ui.unmount()
})
