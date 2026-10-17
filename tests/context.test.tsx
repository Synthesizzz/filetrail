import { expect, test } from 'claude-code/testing'

import { contextLine, mentionedPaths, resolveMention } from '../hooks/context'
import { PANE, START, hasText, world, pressRow } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['a.ts', 'file']],
}
// Keys as the engine hands paths to fs hooks on Windows: absolute, backslashed.
const FILES = { 'C:\\work\\demo\\src\\a.ts': 'x\n', 'C:\\work\\demo\\README.md': '# demo\n' }
const TYPED = { wait: false, origin: { kind: 'composer' } } as const
const rowKey = (path: string) => `row-${path.toLowerCase()}`

/** Answers prompt.submit beneath the mod and keeps what reached it. */
function promptSink(on: any) {
  const got: { text: string; context?: readonly string[] }[] = []
  on('prompt.submit', (_$: any, e: any) => {
    got.push({ text: e.text, context: e.context })
    return { text: e.text, ...(e.context ? { context: e.context } : {}) }
  })
  return got
}

test('contextLine names the selection, inside the project or not', () => {
  expect(contextLine('C:\\work\\demo', 'C:\\work\\demo\\src\\a.ts')).toBe(
    'filetrail: the user has selected src/a.ts (full path: C:/work/demo/src/a.ts) in the file tree. When they say "this file" they likely mean it; the selection alone is not a request.',
  )
  expect(contextLine('C:/work/demo', 'D:/other/b.ts')).toContain('selected D:/other/b.ts in the file tree')
})

test('mentionedPaths finds @paths, quoted ones too, and skips email addresses', () => {
  expect(mentionedPaths('look at @src/a.ts, then @"docs/my file.md". mail a@b.com')).toEqual(['src/a.ts', 'docs/my file.md'])
  expect(mentionedPaths('@README.md?')).toEqual(['README.md'])
  expect(mentionedPaths('no mentions here')).toEqual([])
  expect(resolveMention('C:\\work\\demo', './src/a.ts')).toBe('C:/work/demo/src/a.ts')
  expect(resolveMention('C:/work/demo', 'D:\\x\\y.ts')).toBe('D:/x/y.ts')
})

test('a selected file rides along with every prompt until ✕ clears it', async ($, on) => {
  const got = promptSink(on)
  world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  await $.prompt.submit({ ...TYPED, text: 'before selecting' })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  expect(await hasText(ui, 'Claude sees:')).toBe(true)
  await $.prompt.submit({ ...TYPED, text: 'what is this file?' })
  await $.prompt.submit({ ...TYPED, text: 'and now?' })
  await ui.press({ key: 'unselect' })
  expect(await hasText(ui, 'Claude sees:')).toBe(false)
  await $.prompt.submit({ ...TYPED, text: 'after clearing' })

  expect(got.map(g => [g.text, (g.context ?? []).length])).toEqual([
    ['before selecting', 0], ['what is this file?', 1], ['and now?', 1], ['after clearing', 0],
  ])
  expect(got[1]!.context![0]).toContain('selected README.md')
  await ui.unmount()
})

test('an @path to a file of the project opens the tree there and selects it; other @s do nothing', async ($, on) => {
  const got = promptSink(on)
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  await $.prompt.submit({ ...TYPED, text: 'mail a@b.com about @nothing/here.ts' })
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeUndefined()
  expect(await hasText(ui, 'Claude sees:')).toBe(false)

  await $.prompt.submit({ ...TYPED, text: 'explain @src/a.ts please' })
  await clock.advance(200)
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeDefined()
  expect(await hasText(ui, 'src/a.ts')).toBe(true)
  // The mentioned file is selected, so this very prompt already carries it.
  expect(got.at(-1)!.context![0]).toContain('selected src/a.ts')
  await ui.unmount()
})

test('slash commands are passed as they are, selection or not', async ($, on) => {
  const got = promptSink(on)
  world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  await $.prompt.submit({ ...TYPED, text: '/trail export', command: { name: 'trail', args: 'export' } } as never)
  expect(got.at(-1)!.context).toBeUndefined()
  await ui.unmount()
})
