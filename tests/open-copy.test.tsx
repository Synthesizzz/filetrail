import { expect, test } from 'claude-code/testing'

import { fullCopy, openCommand, osOf, relativeCopy, revealCommand, REVEAL_ENV } from '../hooks/open'
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

test('revealCommand shows a file in its folder, or opens a folder, as each system does it', () => {
  // Windows: explorer run straight from a hidden child opens its window hidden (seen live: the
  // folder was open, no window showed), so Start-Process starts it shown. The path rides in an
  // env var, never in the command line, so spaces, &, % and Thai letters need no quoting.
  const file = revealCommand('windows', 'C:/work/my demo/R&D 100% ไทย.md', false)
  expect(file).toEqual({
    argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath explorer.exe -ArgumentList ('/select,"' + $env:${REVEAL_ENV} + '"')`],
    env: { [REVEAL_ENV]: 'C:\\work\\my demo\\R&D 100% ไทย.md' },
  })
  expect(file.argv.join(' ')).not.toContain('R&D')
  expect(revealCommand('windows', 'C:/work/my demo', true)).toEqual({
    argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath explorer.exe -ArgumentList ('"' + $env:${REVEAL_ENV} + '"')`],
    env: { [REVEAL_ENV]: 'C:\\work\\my demo' },
  })
  expect(revealCommand('mac', '/Users/me/a b.md', false)).toEqual({ argv: ['open', '-R', '/Users/me/a b.md'] })
  expect(revealCommand('mac', '/Users/me/a b', true)).toEqual({ argv: ['open', '/Users/me/a b'] })
  // Linux has no select: the folder holding the file opens.
  expect(revealCommand('linux', '/home/me/a b/c.md', false)).toEqual({ argv: ['xdg-open', '/home/me/a b'] })
  expect(revealCommand('linux', '/home/me/a b', true)).toEqual({ argv: ['xdg-open', '/home/me/a b'] })
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

// Show in the system's file manager: Ctrl+click on a row, or the Reveal button of the selected file.

const FILES = { 'C:/work/demo/README.md': 'x', 'C:\\work\\demo\\README.md': 'x' }
/** What a reveal of `path` runs on Windows, and the path it hands over. */
const shown = (path: string, isDir = false) => revealCommand('windows', path, isDir)
const isReveal = (a: string[]) => a[0] === 'powershell'
const ctrlClick = (ui: any, key: string) => ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', ctrl: true, in: key })

test('Reveal shows the selected file in its folder and says so', async ($, on) => {
  const { clock, ran, envs, toasts } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  await ui.press({ key: 'reveal-file' })
  expect(ran.at(-1)).toEqual(shown('C:/work/demo/README.md').argv)
  expect(envs.at(-1)).toEqual({ [REVEAL_ENV]: 'C:\\work\\demo\\README.md' })
  expect(toasts.at(-1)).toBe('filetrail: showed README.md in its folder')
  await ui.unmount()
})

test('Ctrl+click on a file row shows it in its folder, and does not select it; a plain click still selects', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const key = rowKey('C:/work/demo/README.md')
  await ctrlClick(ui, key)
  expect(ran.filter(isReveal)).toEqual([shown('C:/work/demo/README.md').argv])
  expect(await ui.find({ key: 'reveal-file' })).toBeUndefined()
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: key })
  expect(await ui.find({ key: 'reveal-file' })).toBeDefined()
  expect(ran.filter(isReveal)).toHaveLength(1)
  await ui.unmount()
})

test('Ctrl+click on a folder row opens the folder and does not fold it', async ($, on) => {
  const { clock, ran, envs, toasts } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const key = rowKey('C:/work/demo/Src')
  await ctrlClick(ui, key)
  expect(ran.at(-1)).toEqual(shown('C:/work/demo/Src', true).argv)
  expect(envs.at(-1)).toEqual({ [REVEAL_ENV]: 'C:\\work\\demo\\Src' })
  expect(toasts.at(-1)).toBe('filetrail: opened folder Src')
  await clock.settle()
  expect(await ui.find({ key: rowKey('C:/work/demo/Src/App.ts') })).toBeUndefined()
  await ui.unmount()
})

test('a file that is gone shows its folder instead, as explorer would open Documents for it', async ($, on) => {
  const { clock, ran, envs, toasts } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  await ui.press({ key: 'reveal-file' })
  expect(ran.at(-1)).toEqual(shown('C:/work/demo', true).argv)
  expect(envs.at(-1)).toEqual({ [REVEAL_ENV]: 'C:\\work\\demo' })
  expect(toasts.at(-1)).toBe('filetrail: README.md is gone, showed its folder')
  await ui.unmount()
})

test('a reveal that worked says so; one that failed says why, its exit code when stderr is empty', async ($, on) => {
  let end: { exitCode: number; stderr?: string } = { exitCode: 0 }
  const { clock, toasts } = world(on, { dirs: DIRS, files: FILES, exits: argv => (isReveal(argv) ? end : undefined) })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  await ui.press({ key: 'reveal-file' })
  expect(toasts.at(-1)).toBe('filetrail: showed README.md in its folder')
  end = { exitCode: 2, stderr: 'boom' }
  await ui.press({ key: 'reveal-file' })
  expect(toasts.at(-1)).toBe('filetrail: could not show README.md: boom')
  // Start-Process ends with 0 once explorer is started: a bare 1 is a failure now.
  end = { exitCode: 1 }
  await ui.press({ key: 'reveal-file' })
  expect(toasts.at(-1)).toBe('filetrail: could not show README.md: exit 1')
  await ui.unmount()
})

test('the right click still copies the path and a plain click on a folder still folds it', async ($, on) => {
  const { clock, copies, ran } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const key = rowKey('C:/work/demo/Src')
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'right', in: key })
  expect(copies.at(-1)?.text).toBe('Src')
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: key })
  await clock.settle()
  expect(await ui.find({ key: rowKey('C:/work/demo/Src/App.ts') })).toBeDefined()
  expect(ran.some(isReveal)).toBe(false)
  await ui.unmount()
})
