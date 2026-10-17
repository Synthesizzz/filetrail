import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { pageOf, pageText, PAGE_LINES, refusal } from '../hooks/preview'
import { DONE, KEY, PANE, START, hasText, pressRow, world } from './world'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `const x${i + 1} = ${i + 1}`).join('\n') + '\n'
const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['README.md', 'file'], ['long.ts', 'file'], ['blob.bin', 'file']],
}
const FILES: Record<string, string> = {
  'C:\\work\\demo\\README.md': '# Demo\n\nSome **notes**.\n',
  'C:\\work\\demo\\long.ts': lines(900),
  'C:\\work\\demo\\blob.bin': 'PK\u0003\u0004\u0000\u0000binary',
}
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const README = rowKey('C:/work/demo/README.md')
const LONG = rowKey('C:/work/demo/long.ts')

async function doubleClick(ui: any, key: string) {
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: key })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: key })
}

test('refusal, pageOf and pageText', () => {
  expect(refusal('plain text')).toBe(null)
  expect(refusal('PK\u0000rest')).toBe('binary')
  expect(refusal('x'.repeat(3 * 1024 * 1024))).toBe('large')
  expect(pageOf(null)).toBe(0)
  expect(pageOf(1)).toBe(0)
  expect(pageOf(PAGE_LINES)).toBe(0)
  expect(pageOf(PAGE_LINES + 1)).toBe(1)
  const p = pageText(lines(900), 1)
  expect(p.first).toBe(401)
  expect(p.total).toBe(900)
  expect(p.source.split('\n')[0]).toBe('const x401 = 401')
  // A page past the end shows the last one.
  expect(pageText(lines(900), 9).first).toBe(801)
})

test('a double-click shows a Markdown file in place of the tree; ← files brings the tree back', { timeoutMs: 10_000 }, async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, README)
  await clock.settle()
  expect(await ui.find({ key: 'preview-md' })).toMatchObject({ props: { text: '# Demo\n\nSome **notes**.' } })
  expect(await ui.find({ key: README })).toBeUndefined()
  expect(await ui.find({ key: 'search' })).toBeUndefined()
  await ui.press({ key: 'preview-back' })
  expect(await ui.find({ key: 'preview' })).toBeUndefined()
  expect(await ui.find({ key: README })).toBeDefined()
  await ui.unmount()
})

test('code shows highlighted with line numbers, a page at a time', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, LONG)
  await clock.settle()
  const code = await ui.find({ type: 'Code' })
  expect(code?.props).toMatchObject({ path: 'C:/work/demo/long.ts', startLine: 1 })
  expect(String(code?.props?.source).split('\n').length).toBe(PAGE_LINES)
  expect(await hasText(ui, 'lines 1–400 of 900')).toBe(true)
  await ui.press({ key: 'preview-next' })
  await clock.settle()
  expect((await ui.find({ type: 'Code' }))?.props?.startLine).toBe(401)
  await ui.press({ key: 'preview-next' })
  await ui.press({ key: 'preview-next' })
  await clock.settle()
  expect(await hasText(ui, 'lines 801–900 of 900')).toBe(true)
  await ui.unmount()
})

test('a binary file is not shown, and ↗ still opens it in its default app', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, rowKey('C:/work/demo/blob.bin'))
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /binary file/ })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'preview-open' })
  expect(ran.at(-1)).toEqual(['cmd', '/c', 'start', '', 'C:\\work\\demo\\blob.bin'])
  await ui.unmount()
})

test('the preview reads its file again after Claude edits it', async ($, on) => {
  const files = { ...FILES }
  const { clock } = world(on, { dirs: DIRS, files })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, README)
  await clock.settle()
  await $.turn.start({ text: 'edit', turnId: 't1' })
  files['C:\\work\\demo\\README.md'] = '# Demo, edited\n'
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\README.md', old_string: '# Demo', new_string: '# Demo, edited' })
  await clock.settle()
  expect((await ui.find({ key: 'preview-md' }))?.props?.text).toBe('# Demo, edited')
  await $.turn.complete({ ...DONE, turnId: 't1' })
  await ui.unmount()
})

const EDITED: Turn[] = [{
  id: 't1', at: 1, prompt: 'edit long',
  steps: [{ id: 't1.0', path: 'C:/work/demo/long.ts', rel: 'long.ts', tool: 'Edit', note: '', status: 'ok', line: 450, add: 1, del: 1, diff: [{ op: '+', t: 'x' }], at: 1 }],
}]

test('View file in History shows the file at the page holding the edited line', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, stored: { [KEY]: EDITED } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-t1')
  await ui.press({ key: 'view-file' })
  await clock.settle()
  expect(await ui.find({ key: 'tab-files' })).toBeDefined()
  expect((await ui.find({ type: 'Code' }))?.props?.startLine).toBe(401)
  await ui.unmount()
})
