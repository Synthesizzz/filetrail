import { expect, test } from 'claude-code/testing'

import { PANE, START, pressRow, rowText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['Src', 'dir'], ['.env', 'file'], ['README.md', 'file']],
  'C:/work/demo/Src': [['App.ts', 'file']],
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const SRC = rowKey('C:/work/demo/Src')
const APP = rowKey('C:/work/demo/Src/App.ts')
const README = rowKey('C:/work/demo/README.md')

test('↻ lists the open folders again and reads git again', async ($, on) => {
  const { clock, lists, ran } = world(on, { dirs: DIRS, git: { top: 'C:/work/demo', status: '## main\0', numstat: '' } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, SRC)
  await clock.advance(1000)
  const listedBefore = lists.length
  const statusBefore = ran.filter(a => a[1] === 'status').length
  await ui.press({ key: 'refresh' })
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
  expect((await ui.find({ key: 'dots' }))?.props?.label).toBe('◉')
  await ui.press({ key: 'dots' })
  expect(await ui.find({ key: env })).toBeUndefined()
  expect((await ui.find({ key: 'dots' }))?.props?.label).toBe('○')
  await ui.press({ key: 'dots' })
  expect(await ui.find({ key: env })).toBeDefined()
  await ui.unmount()
})

test('⊟ closes every folder; ⌖ shows only with a selection and opens the tree back to it', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'go-selected' })).toBeUndefined()
  await pressRow(ui, SRC)
  await pressRow(ui, APP)
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ key: APP })).toBeUndefined()
  expect(await rowText(ui, SRC)).toMatch(/^▸/)
  await ui.press({ key: 'go-selected' })
  await clock.settle()
  expect(await ui.find({ key: APP })).toBeDefined()
  expect(await rowText(ui, SRC)).toMatch(/^▾/)
  await ui.unmount()
})

test('a double-click on a file opens it in its default app; on a folder the second click is let be', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: README })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: README })
  await clock.settle()
  expect(ran.at(-1)).toEqual(['cmd', '/c', 'start', '', 'C:\\work\\demo\\README.md'])
  // The first click selected it, as a single click does.
  expect(await rowText(ui, README)).toMatch(/README\.md/)

  const before = ran.length
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: SRC })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: SRC })
  await clock.settle()
  // Opened by the first click, not closed again by the second; nothing run.
  expect(await rowText(ui, SRC)).toMatch(/^▾/)
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
  expect(await ui.find({ key: 'go-selected' })).toBeUndefined()
  expect(await rowText(ui, SRC)).toMatch(/^▸/)
  await ui.unmount()
})
