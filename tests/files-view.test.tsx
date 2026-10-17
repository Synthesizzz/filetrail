import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { DONE, KEY, PANE, START, rowText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['.git', 'dir'], ['README.md', 'file'], ['tmp', 'dir']],
  'C:/work/demo/src': [['a.ts', 'file'], ['new.ts', 'file']],
  'C:/work/demo/tmp': [['scratch.txt', 'file']],
}
const GIT = {
  top: 'C:/work/demo',
  status: '## main...origin/main [ahead 1]\0 M src/a.ts\0?? src/new.ts\0?? tmp/\0',
  numstat: '3\t1\tsrc/a.ts\n',
}
const EDITED: Turn[] = [{
  id: 't1', at: 1, prompt: 'edit a',
  steps: [1, 2].map(n => ({
    id: `t1.${n}`, path: 'C:/work/demo/src/a.ts', rel: 'src/a.ts', tool: 'Edit', note: '', status: 'ok' as const,
    line: 1, add: 1, del: 1, diff: [], at: 1,
  })),
}]

const rowKey = (path: string) => `row-${path.toLowerCase()}`
const ROOT_ROWS = ['src', 'tmp', 'README.md']

test('Files: the root listing, git status, line counts and edit badges', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS, git: GIT, stored: { [KEY]: EDITED } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  expect(await ui.find({ type: 'Text', text: '⎇ main ↑1' })).toBeDefined()
  const rows = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('row-'))
  expect(rows).toEqual(ROOT_ROWS.map(n => rowKey(`C:/work/demo/${n}`)))
  expect(ran.map(a => a[1])).toEqual(['rev-parse', 'status', 'diff'])

  // A folder with a change beneath it, closed: Claude's edits show as a dot.
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▸ src\/ ●$/)
  expect(await rowText(ui, rowKey('C:/work/demo/tmp'))).toMatch(/^▸ tmp\/ \?$/)

  // Opening it lists it and shows each file's status, counts and edits.
  await ui.press({ key: rowKey('C:/work/demo/src') })
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/^\s+a\.ts ●2 \+3 -1$/)
  expect(await rowText(ui, rowKey('C:/work/demo/src/new.ts'))).toMatch(/^\s+new\.ts \?$/)
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▾ src\/$/)
  // The indent is non-breaking: the desktop collapses leading plain spaces (seen live: every row flush left).
  expect((await ui.find({ key: rowKey('C:/work/demo/src/a.ts') }))?.text?.slice(0, 4)).toBe('\u00a0'.repeat(4))

  // Closing hides its files again.
  await ui.press({ key: rowKey('C:/work/demo/src') })
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeUndefined()
  await ui.unmount()
})

test('Files outside a repo: git is asked once and the header says so', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.turn.complete({ ...DONE, turnId: 't1' })
  await clock.advance(1000)
  expect(ran.map(a => a[1])).toEqual(['rev-parse'])
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'not a git repo' })).toBeDefined()
  await ui.unmount()
})

test('a Write lists its folder again, so the new file shows', async ($, on) => {
  const dirs = { ...DIRS, 'C:/work/demo/src': [...DIRS['C:/work/demo/src']!] }
  const { clock } = world(on, { dirs, git: GIT })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: rowKey('C:/work/demo/src') })
  expect(await ui.find({ key: rowKey('C:/work/demo/src/b.ts') })).toBeUndefined()

  await $.turn.start({ text: 'add b', turnId: 't1' })
  dirs['C:/work/demo/src']!.push(['b.ts', 'file'])
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\src\\b.ts', content: 'b\n' })
  expect(await ui.find({ key: rowKey('C:/work/demo/src/b.ts') })).toBeDefined()
  await ui.unmount()
})

test('a file row can be selected, with a marker every surface shows', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: rowKey('C:/work/demo/README.md') })
  // The desktop draws no inverse: the marker and bold carry the selection there.
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toBe('› README.md')
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▸ src\//)
  // Its row is drawn inverse, and the line under the header names it.
  const names = (await ui.findAll({ type: 'Text' })).filter(t => t.text === 'README.md')
  expect(names.some(t => t.props?.inverse === true)).toBe(true)
  expect(names.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: '· no edits recorded' })).toBeDefined()
  await ui.unmount()
})
