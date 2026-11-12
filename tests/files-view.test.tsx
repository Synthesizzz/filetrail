import { expect, test } from './kit'

import type { Turn } from '../types'
import { FOLDER_COLOR, GIT_HEX, SELECTED_BG, typeColor } from '../hooks/files-view'
import { DONE, KEY, PANE, START, hasRow, hasText, pressRow, rowRuns, rowText, textOf, world } from './world'

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

// Long: many steps through the tree and its Client rows, near the default 5 s on a loaded machine.
test('Files: the root listing, git status, line counts and edit badges', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS, git: GIT, stored: { [KEY]: EDITED } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  // The branch is a chip in the card's title bar: its name and commits ahead.
  expect(await ui.find({ type: 'Text', text: 'main ↑1' })).toBeDefined()
  // Each tree row is a Client: its colours paint on the desktop, where a Button drops them.
  const rows = (await ui.findAll({ type: 'Client' })).map(b => b.key).filter(k => k?.startsWith('row-'))
  expect(rows).toEqual(ROOT_ROWS.map(n => rowKey(`C:/work/demo/${n}`)))
  // With history, git is also asked which of its files it ignores (History leaves those out).
  expect(ran.map(a => a[1])).toEqual(['rev-parse', 'status', 'diff', 'check-ignore'])

  // filetree's way, at the right edge: a folder sums its files' lines and counts its changes
  // by kind (Claude's edits a ● before them); a folder untracked as a whole, and each file, a letter.
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▸ ■ src\/ ● \+3 -1 \?:1 M:1 {2}$/)
  const src = await rowRuns(ui, rowKey('C:/work/demo/src'))
  expect(src.find(r => r.text === 'M:1')?.props.color).toBe(GIT_HEX.changed)
  expect(src.find(r => r.text === '?:1')?.props.color).toBe(GIT_HEX.added)
  expect(src.find(r => r.text === 'src/')?.props.color).toBe(GIT_HEX.changed)
  // Monospace rows, as filetree's: the badges and dates line up in a column.
  expect(((await ui.find({ key: rowKey('C:/work/demo/src') }))?.props as any)?.props?.mono).toBe(true)
  expect(src.find(r => r.text === '■ ')?.props.color).toBe(FOLDER_COLOR)
  expect(await rowText(ui, rowKey('C:/work/demo/tmp'))).toMatch(/^▸ ■ tmp\/ +U {2}$/)
  // The values sit in columns: the U ends where the folder's last count does.
  expect([...(await rowText(ui, rowKey('C:/work/demo/tmp')))].length).toBe([...(await rowText(ui, rowKey('C:/work/demo/src')))].length)
  // A file git has no change for shows nothing at the right (no date), and keeps the room for its name.
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toBe('  • README.md')
  // The branch line: head, upstream, and the repo's changes at the right.
  // The repo's changes are the chip beside it.
  expect(await ui.find({ type: 'Text', text: '+3 -1 ?:2 M:1' })).toBeDefined()

  // Opening it lists it and shows each file's status, counts and edits.
  await pressRow(ui, rowKey('C:/work/demo/src'))
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/^\s+• a\.ts ●2 \+3 -1 +M {2}$/)
  expect(await rowText(ui, rowKey('C:/work/demo/src/new.ts'))).toMatch(/^\s+• new\.ts +U {2}$/)
  const newTs = await rowRuns(ui, rowKey('C:/work/demo/src/new.ts'))
  expect(newTs.find(r => r.text === 'U')?.props.color).toBe(GIT_HEX.added)
  // The marker takes the file type's colour; the name keeps git's.
  expect(newTs.find(r => r.text.startsWith('•'))?.props.color).toBe(typeColor('new.ts'))
  expect(newTs.find(r => r.text === 'new.ts')?.props.color).toBe(GIT_HEX.added)
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▾ ■ src\/ +\+3 -1 \?:1 M:1 {2}$/)
  // The indent is non-breaking: the desktop collapses leading plain spaces (seen live: every row flush left);
  // a narrow one follows it, before the icon.
  expect(textOf(await ui.drawn({ in: rowKey('C:/work/demo/src/a.ts') })).slice(0, 4)).toBe('\u00a0'.repeat(3) + '\u202f')

  // Closing hides its files again.
  await pressRow(ui, rowKey('C:/work/demo/src'))
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
  await pressRow(ui, rowKey('C:/work/demo/src'))
  expect(await hasRow(ui, rowKey('C:/work/demo/src/b.ts'))).toBe(false)

  await $.turn.start({ text: 'add b', turnId: 't1' })
  dirs['C:/work/demo/src']!.push(['b.ts', 'file'])
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\src\\b.ts', content: 'b\n' })
  expect(await hasRow(ui, rowKey('C:/work/demo/src/b.ts'))).toBe(true)
  await ui.unmount()
})

test('a click on a row\'s Client presses it; a right click and a hover do not', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const src = rowKey('C:/work/demo/src')
  await ui.pointer({ type: 'enter', x: 2, y: 0, in: src })
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'right', in: src })
  expect(await rowText(ui, src)).toMatch(/^▸ ■ src\//)
  // Hovered, the name is underlined, as a Button's label would light.
  expect((await rowRuns(ui, src)).find(r => r.text === 'src/')?.props.underline).toBe(true)
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: src })
  await clock.settle()
  expect(await rowText(ui, src)).toMatch(/^▾ ■ src\//)
  await ui.unmount()
})

test('a file row can be selected, with a marker every surface shows', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/README.md'))
  // The desktop draws no inverse: a Client row is filled and bold instead (a Button row gets a ›).
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toBe('  • README.md')
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/^▸ ■ src\//)
  // Its name is bold, its row filled, and the line under the header names it.
  const name = (await rowRuns(ui, rowKey('C:/work/demo/README.md'))).find(r => r.text === 'README.md')
  expect(name?.props.weight).toBe('semibold')
  expect(((await ui.find({ key: rowKey('C:/work/demo/README.md') }))?.props as any)?.props?.bg).toBe(SELECTED_BG)
  expect(((await ui.find({ key: rowKey('C:/work/demo/src') }))?.props as any)?.props?.bg).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).filter(t => t.text === 'README.md').length).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'no edits recorded' })).toBeDefined()
  await ui.unmount()
})

test('a count of zero is left out: lines only added show +N without -0', async ($, on) => {
  const git = { top: 'C:/work/demo', status: '## main\0 M src/a.ts\0', numstat: '2\t0\tsrc/a.ts\n' }
  const { clock } = world(on, { dirs: DIRS, git })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await rowText(ui, rowKey('C:/work/demo/src'))).toMatch(/src\/ \+2 M:1 {2}$/)
  expect(await ui.find({ type: 'Text', text: '+2 M:1' })).toBeDefined()
  await ui.unmount()
})

test('typeColor: a colour per file type, by extension and ignoring case; none for the rest', () => {
  expect(typeColor('C:/w/app.ts')).toBe(typeColor('C:/w/View.TSX'))
  expect(typeColor('C:/w/app.ts')).not.toBe(typeColor('C:/w/app.js'))
  for (const p of ['a.py', 'README.md', 'package.json', 'ci.yml', 'site.css', 'index.html', 'q.sql', 'lab.ipynb']) expect([p, typeof typeColor(p)]).toEqual([p, 'string'])
  for (const p of ['Makefile', 'logo.png', '.env']) expect([p, typeColor(p)]).toEqual([p, undefined])
})

test('colour is quiet: one ■ colour for every folder, names plain unless git or Claude colour them, node_modules and dot folders dim', async ($, on) => {
  const { clock } = world(on, {
    dirs: {
      'C:/work/demo': [['.config', 'dir'], ['docs', 'dir'], ['node_modules', 'dir'], ['src', 'dir'], ['a.md', 'file']],
      'C:/work/demo/src': [['deep', 'dir']],
      'C:/work/demo/src/deep': [['x.ts', 'file']],
    },
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/src'))
  await pressRow(ui, rowKey('C:/work/demo/src/deep'))
  const run = async (path: string, match: (text: string) => boolean) => (await rowRuns(ui, rowKey(path))).find(r => match(r.text))?.props
  const marker = (path: string) => run(path, t => t.startsWith('■'))
  const name = (path: string, text: string) => run(path, t => t === text)
  // Folders side by side and nested all have the one colour.
  for (const p of ['docs', 'src', 'src/deep']) expect([p, (await marker(`C:/work/demo/${p}`))?.color]).toEqual([p, FOLDER_COLOR])
  // With nothing for git to say, names have no colour of their own: a folder's, a file's in it, one at the root.
  for (const [p, n] of [['docs', 'docs/'], ['src', 'src/'], ['src/deep', 'deep/'], ['src/deep/x.ts', 'x.ts'], ['a.md', 'a.md']] as const) {
    expect([p, (await name(`C:/work/demo/${p}`, n))?.color]).toEqual([p, undefined])
    expect([p, (await name(`C:/work/demo/${p}`, n))?.dimColor]).toEqual([p, undefined])
  }
  // Generated and hidden folders step back: the marker and the name are dim.
  for (const [p, n] of [['node_modules', 'node_modules/'], ['.config', '.config/']] as const) {
    expect([p, (await marker(`C:/work/demo/${p}`))?.dimColor]).toEqual([p, true])
    expect([p, (await name(`C:/work/demo/${p}`, n))?.dimColor]).toEqual([p, true])
  }
  expect((await marker('C:/work/demo/docs'))?.dimColor).toBeUndefined()
  await ui.unmount()
})

test('git and Claude still colour a name in the quiet tree', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, git: GIT, stored: { [KEY]: EDITED } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const name = async (path: string, text: string) => (await rowRuns(ui, rowKey(path))).find(r => r.text === text)?.props.color
  // src has a changed file in it (yellow), tmp is untracked (green): both git's colours, not a folder palette.
  expect(await name('C:/work/demo/src', 'src/')).toBe(GIT_HEX.changed)
  expect(await name('C:/work/demo/tmp', 'tmp/')).toBe(GIT_HEX.added)
  await ui.unmount()
})
