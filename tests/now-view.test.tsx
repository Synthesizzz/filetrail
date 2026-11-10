import { expect, test } from 'claude-code/testing'

import { DONE, PANE, START, hasRow, hasText, pressRow, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['docs', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['deep', 'dir'], ['a.ts', 'file'], ['b.ts', 'file']],
  'C:/work/demo/src/deep': [['x.ts', 'file'], ['y.ts', 'file']],
  'C:/work/demo/docs': [['guide.md', 'file']],
}
const FILES = { 'C:\\work\\demo\\src\\a.ts': 'a\n', 'C:\\work\\demo\\src\\deep\\x.ts': 'x\n', 'C:\\work\\demo\\docs\\guide.md': '#\n' }
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const shows = (ui: any, path: string) => hasRow(ui, rowKey(path))

test('Now shows only the way down to this turn\'s files, keeps them once the turn ends, and starts empty with the next', async ($, on) => {
  const { clock, store } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // All, the default: the root's folders and files.
  expect(await shows(ui, 'C:/work/demo/docs')).toBe(true)

  // The tabs are a Client: a press posts the view it chose.
  await ui.post({ mode: 'now' }, { in: 'tree-modes' })
  expect(store.get('filetrail:treeMode')).toBe('now')
  expect(await hasText(ui, "Nothing touched this turn yet: Claude's files show here as it reads and edits them.")).toBe(true)

  await $.turn.start({ turnId: 't1', text: 'fix it' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\a.ts' } as never)
  await clock.advance(200)
  for (const p of ['C:/work/demo/src', 'C:/work/demo/src/deep', 'C:/work/demo/src/deep/x.ts', 'C:/work/demo/src/a.ts']) expect([p, await shows(ui, p)]).toEqual([p, true])
  // The folder Claude is in now (a.ts's, src) shows whole: b.ts too.
  expect(await shows(ui, 'C:/work/demo/src/b.ts')).toBe(true)
  // Elsewhere only what Claude touched, and only the folders on the way.
  for (const p of ['C:/work/demo/src/deep/y.ts', 'C:/work/demo/docs', 'C:/work/demo/README.md']) expect([p, await shows(ui, p)]).toEqual([p, false])

  // Claude moves into deep: now deep shows whole, and src only what was touched.
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/src/deep/x.ts' } as never)
  await clock.advance(200)
  expect(await shows(ui, 'C:/work/demo/src/deep/y.ts')).toBe(true)
  expect(await shows(ui, 'C:/work/demo/src/b.ts')).toBe(false)

  // Idle: the last turn's files stay.
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(200)
  expect(await shows(ui, 'C:/work/demo/src/a.ts')).toBe(true)

  // The next turn starts empty.
  await $.turn.start({ turnId: 't2', text: 'next' } as never)
  await clock.advance(200)
  expect(await shows(ui, 'C:/work/demo/src/a.ts')).toBe(false)
  await ui.unmount()
})

test('a folder pressed in Now opens the whole tree there; the view is remembered for the next session', async ($, on) => {
  const { clock, store } = world(on, { dirs: DIRS, files: FILES, stored: { 'filetrail:treeMode': 'now' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // Now, as left in the last session.
  expect(await shows(ui, 'C:/work/demo/docs')).toBe(false)
  await $.turn.start({ turnId: 't1', text: 'x' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\deep\\x.ts' } as never)
  await clock.advance(200)

  await pressRow(ui, rowKey('C:/work/demo/src/deep'))
  await clock.advance(200)
  expect(store.get('filetrail:treeMode')).toBe('all')
  // All, with deep open: its other file shows, and the root's other folders too.
  expect(await shows(ui, 'C:/work/demo/src/deep/y.ts')).toBe(true)
  expect(await shows(ui, 'C:/work/demo/docs')).toBe(true)
  await ui.unmount()
})
