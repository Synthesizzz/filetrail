import { expect, test } from 'claude-code/testing'

import { fullCopy, openCommand, osOf, relativeCopy } from '../hooks/open'
import { DONE, PANE, START, hasText, world, pressRow } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['Src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/Src': [['App.ts', 'file']],
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`

test('osOf and openCommand per system, a path with spaces and & passed whole', () => {
  expect(osOf('C:\\work\\demo', '')).toBe('windows')
  expect(osOf('/Users/me/demo', 'Darwin\n')).toBe('mac')
  expect(osOf('/home/me/demo', 'Linux\n')).toBe('linux')
  expect(openCommand('windows', 'C:/work/my demo/R&D notes.md')).toEqual(['cmd', '/c', 'start', '', 'C:\\work\\my demo\\R&D notes.md'])
  expect(openCommand('mac', '/Users/me/a b.md')).toEqual(['open', '/Users/me/a b.md'])
  expect(openCommand('linux', '/home/me/a.md')).toEqual(['xdg-open', '/home/me/a.md'])
})

test('relativeCopy is from the root with forward slashes; fullCopy is as the system writes it', () => {
  expect(relativeCopy('C:\\work\\demo', 'C:/work/demo/Src/App.ts')).toBe('Src/App.ts')
  expect(fullCopy('windows', 'C:/work/demo/Src/App.ts')).toBe('C:\\work\\demo\\Src\\App.ts')
  expect(fullCopy('linux', '/home/me/a.md')).toBe('/home/me/a.md')
})

test('Open runs the default app for the selected file and says so', async ($, on) => {
  const { clock, ran, toasts } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  await ui.press({ key: 'open-file' })
  expect(ran.at(-1)).toEqual(['cmd', '/c', 'start', '', 'C:\\work\\demo\\README.md'])
  expect(toasts.at(-1)).toBe('filetrail: opened README.md')
  await ui.unmount()
})

test('Copy path and Copy full path put the path on the pressed surface\'s clipboard', async ($, on) => {
  const { clock, copies, toasts } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/Src'))
  await pressRow(ui, rowKey('C:/work/demo/Src/App.ts'))
  await ui.press({ key: 'copy-path' })
  await ui.press({ key: 'copy-full' })
  expect(copies).toEqual([
    { text: 'Src/App.ts', surface: 'desktop' },
    { text: 'C:\\work\\demo\\Src\\App.ts', surface: 'desktop' },
  ])
  expect(toasts.at(-1)).toBe('filetrail: copied C:/work/demo/Src/App.ts')
  await ui.unmount()
})

test('folders listed again after a turn keep their spelling', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/Src'))
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.turn.complete({ ...DONE, turnId: 't1' })
  await pressRow(ui, rowKey('C:/work/demo/Src/App.ts'))
  // The selected file's line names its folder as spelled, not lower-cased.
  expect(await hasText(ui, 'Src')).toBe(true)
  expect(await hasText(ui, 'src')).toBe(false)
  await ui.unmount()
})
