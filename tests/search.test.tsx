import { expect, test } from 'claude-code/testing'

import { findFiles, matchRank, parseLsFiles } from '../hooks/search'
import { PANE, START, hasText, plain, world } from './world'

const FILES = ['src/readme-parser.ts', 'README.md', 'docs/guide/README.md', 'src/app.ts', 'tests/read.test.ts', 'src/bread/loaf.ts']
const rowKey = (path: string) => `row-${path.toLowerCase()}`

test('parseLsFiles splits NUL-separated paths', () => {
  expect(parseLsFiles('src/a.ts\0README.md\0')).toEqual(['src/a.ts', 'README.md'])
  expect(parseLsFiles('')).toEqual([])
})

test('matchRank: name start, name contains, path only', () => {
  expect(matchRank('src/readme-parser.ts', 'read')).toBe(0)
  expect(matchRank('src/bread/loaf.ts', 'read')).toBe(2)
  expect(matchRank('tests/read.test.ts', 'test')).toBe(1)
  expect(matchRank('src/app.ts', 'read')).toBe(null)
})

test('findFiles ranks, breaks ties by shorter path, ignores case, and counts all', () => {
  expect(findFiles(FILES, 'READ')).toEqual({
    hits: ['README.md', 'tests/read.test.ts', 'docs/guide/README.md', 'src/readme-parser.ts', 'src/bread/loaf.ts'],
    total: 5,
  })
  expect(findFiles(FILES, 'read', 2)).toEqual({ hits: ['README.md', 'tests/read.test.ts'], total: 5 })
  expect(findFiles(FILES, '   ')).toEqual({ hits: [], total: 0 })
  expect(findFiles(FILES, 'src\\app')).toEqual({ hits: ['src/app.ts'], total: 1 })
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['node_modules', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['app.ts', 'file'], ['deep', 'dir']],
  'C:/work/demo/src/deep': [['readme-parser.ts', 'file']],
  'C:/work/demo/node_modules': [['readme-lib.js', 'file']],
}

test('in a repo the search lists git\'s files; picking one opens the tree there, selected', async ($, on) => {
  const git = { top: 'C:/work/demo', status: '## main\0', numstat: '', lsFiles: 'src/app.ts\0src/deep/readme-parser.ts\0README.md\0' }
  const { clock, ran } = world(on, { dirs: DIRS, git })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })

  await ui.input({ key: 'search', text: 'readme' })
  expect(ran.some(a => a[1] === 'ls-files')).toBe(true)
  expect(await hasText(ui, '2 matches')).toBe(true)
  const hits = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('hit-'))
  expect(hits).toEqual(['hit-readme.md', 'hit-src/deep/readme-parser.ts'])
  expect(plain((await ui.find({ key: 'hit-src/deep/readme-parser.ts' }))?.text)).toBe('readme-parser.ts src/deep')
  // The tree is out of the way while searching.
  expect(await ui.find({ key: rowKey('C:/work/demo/src') })).toBeUndefined()

  await ui.press({ key: 'hit-src/deep/readme-parser.ts' })
  await clock.advance(200)
  expect(await ui.find({ key: 'hit-readme.md' })).toBeUndefined()
  expect(await ui.find({ key: rowKey('C:/work/demo/src/deep/readme-parser.ts') })).toBeDefined()
  expect(await hasText(ui, 'Claude sees:')).toBe(true)
  await ui.unmount()
})

test('outside a repo the search walks the folders, skipping node_modules', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.input({ key: 'search', text: 'readme' })
  const hits = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('hit-'))
  expect(hits).toEqual(['hit-readme.md', 'hit-src/deep/readme-parser.ts'])
  await ui.unmount()
})

test('no match says so, and ✕ brings the tree back', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.input({ key: 'search', text: 'zzz' })
  expect(await hasText(ui, 'No files match.')).toBe(true)
  await ui.press({ key: 'search-clear' })
  expect(await ui.find({ key: rowKey('C:/work/demo/src') })).toBeDefined()
  expect(await ui.find({ key: 'search-clear' })).toBeUndefined()
  await ui.unmount()
})
