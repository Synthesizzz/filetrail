import { expect, test } from 'claude-code/testing'

import { BROWSE_MS } from '../hooks/activity'
import { PANE, START, hasText, pressRow, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['docs', 'dir'], ['notes', 'dir']],
  'C:/work/demo/src': [['deep', 'dir'], ['a.ts', 'file']],
  'C:/work/demo/src/deep': [['x.ts', 'file']],
  'C:/work/demo/docs': [['guide.md', 'file']],
  'C:/work/demo/notes': [['todo.md', 'file']],
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const SRC = rowKey('C:/work/demo/src')
const DEEP = rowKey('C:/work/demo/src/deep')
const DOCS = rowKey('C:/work/demo/docs')
const NOTES = rowKey('C:/work/demo/notes')
const shows = async (ui: any, key: string) => (await ui.find({ key })) !== undefined

test('following Claude opens the folder it works in and folds the ones it left', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' })
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/src/deep/x.ts'))).toBe(true)

  // Claude moves to docs: src and deep, opened only to show x.ts, fold; docs opens.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\docs\\guide.md' })
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/docs/guide.md'))).toBe(true)
  expect(await shows(ui, DEEP)).toBe(false)
  expect(await shows(ui, rowKey('C:/work/demo/src/a.ts'))).toBe(false)
  await ui.unmount()
})

test('a folder on the way to the next file stays open; one the person just opened stays a while', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // The person opens notes themself.
  await pressRow(ui, NOTES)
  await clock.settle()

  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' })
  await clock.settle()
  // Then a file in src itself: src leads there and stays; deep folds.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\a.ts' })
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/src/a.ts'))).toBe(true)
  expect(await shows(ui, rowKey('C:/work/demo/src/deep/x.ts'))).toBe(false)
  // notes was opened by the person moments ago: they may be browsing it, so it stays.
  expect(await shows(ui, rowKey('C:/work/demo/notes/todo.md'))).toBe(true)

  // The person opens deep again: Claude moving to docs leaves it, and src above it, open.
  await pressRow(ui, DEEP)
  await clock.settle()
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\docs\\guide.md' })
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/src/deep/x.ts'))).toBe(true)
  expect(await shows(ui, DOCS)).toBe(true)
  expect(await shows(ui, SRC)).toBe(true)
  await ui.unmount()
})

test('the tree scrolls under the card: a short pane draws what fits, and glides to Claude\'s file', async ($, on) => {
  const many = Array.from({ length: 30 }, (_, k) => `f${String(k).padStart(2, '0')}.md`)
  const { clock } = world(on, { dirs: { 'C:\\work\\demo': many.map(n => [n, 'file'] as [string, 'file']) } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 20 } } })
  await clock.settle()
  // 20 rows less a first guess of the head's 4: 16 lines, the last saying what is below.
  expect(await shows(ui, rowKey('C:/work/demo/f14.md'))).toBe(true)
  expect(await shows(ui, rowKey('C:/work/demo/f15.md'))).toBe(false)
  expect(await hasText(ui, '▼ 15 below')).toBe(true)
  // The card stays: the head is drawn whatever the tree shows.
  expect(await ui.find({ key: 'now-card' })).toBeDefined()

  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\f25.md' })
  await clock.advance(1000)
  expect(await shows(ui, rowKey('C:/work/demo/f25.md'))).toBe(true)
  expect(await shows(ui, rowKey('C:/work/demo/f00.md'))).toBe(false)
  expect((await ui.findAll({ type: 'Text' })).some((t: any) => /^▲ \d+ above$/.test(t.text ?? ''))).toBe(true)
  await ui.unmount()
})

test('a folder the person opened folds too once they left it alone a while', { timeoutMs: 10_000 }, async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, NOTES)
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/notes/todo.md'))).toBe(true)

  // Past the browsing window, Claude's next file folds every folder not on its way.
  await clock.advance(BROWSE_MS + 1000)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\docs\\guide.md' })
  await clock.settle()
  expect(await shows(ui, rowKey('C:/work/demo/docs/guide.md'))).toBe(true)
  expect(await shows(ui, rowKey('C:/work/demo/notes/todo.md'))).toBe(false)
  expect(await shows(ui, NOTES)).toBe(true)
  await ui.unmount()
})
