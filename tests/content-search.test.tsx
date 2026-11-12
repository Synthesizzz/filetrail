import { expect, test } from './kit'

import { PANE, START, hasText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['a.ts', 'file'], ['big.ts', 'file']],
}
const BIG = Array.from({ length: 900 }, (_, i) => `const x${i + 1} = ${i + 1}`).join('\n') + '\n'
const FILES: Record<string, string> = {
  'C:\\work\\demo\\README.md': '# Guard\n',
  'C:\\work\\demo\\src\\a.ts': 'one\n',
  'C:\\work\\demo\\src\\big.ts': BIG,
}
const GIT = { top: 'C:/work/demo', status: '## main\0', numstat: '', lsFiles: 'src/a.ts\0src/big.ts\0README.md\0' }
const HITS = 'src/a.ts\x0012\x00  const guard = 1\nsrc/a.ts\x0020\x00guard()\nREADME.md\x001\x00# Guard\nsrc/big.ts\x00450\x00const x450 = guard\n'
const searched = (ran: string[][]) => ran.filter(a => a.includes('grep'))
const gitGrep = (argv: string[]) => (argv[0] === 'git' ? { stdout: HITS } : undefined)

async function open($: any, on: any, options: object = {}) {
  const w = world(on, { dirs: DIRS, files: FILES, git: GIT, grep: gitGrep, ...options })
  await $.session.start(START)
  await w.clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  return { ...w, ui }
}
const type = async (ui: any, clock: any, text: string) => {
  await ui.input({ key: 'search', text, kind: 'change' })
  await clock.advance(500)
}

test('Contents is off at first: typing looks at file names and runs no grep', async ($, on) => {
  const { ui, clock, ran } = await open($, on)
  expect((await ui.find({ key: 'search-contents' }))?.props?.label).toBe('Contents')
  expect((await ui.find({ key: 'search' }))?.props?.placeholder).toBe('Search files')
  await type(ui, clock, 'guard')
  expect(searched(ran)).toEqual([])
  await ui.unmount()
})

test('with Contents on, a query runs git grep once and the matches show grouped by file with their lines', async ($, on) => {
  const { ui, clock, ran } = await open($, on)
  await ui.press({ key: 'search-contents' })
  expect((await ui.find({ key: 'search' }))?.props?.placeholder).toBe('Search inside files')
  await type(ui, clock, 'guard')
  const runs = searched(ran)
  expect(runs).toHaveLength(1)
  expect(runs[0]!.slice(0, 2)).toEqual(['git', 'grep'])
  expect(runs[0]!.at(-2)).toBe('-e')
  expect(runs[0]!.at(-1)).toBe('guard')
  expect(await hasText(ui, '4 matches in 3 files')).toBe(true)
  const buttons = (await ui.findAll({ type: 'Button' })).map((b: any) => b.key).filter((k: string) => k?.startsWith('cm-'))
  expect(buttons).toEqual(['cm-src/a.ts:12', 'cm-src/a.ts:20', 'cm-readme.md:1', 'cm-src/big.ts:450'])
  expect(await hasText(ui, 'a.ts')).toBe(true)
  expect(await hasText(ui, 'src')).toBe(true)
  await ui.unmount()
})

test('typing fast runs one search, for what was typed last', async ($, on) => {
  const { ui, clock, ran } = await open($, on)
  await ui.press({ key: 'search-contents' })
  await ui.input({ key: 'search', text: 'gu', kind: 'change' })
  await ui.input({ key: 'search', text: 'gua', kind: 'change' })
  await ui.input({ key: 'search', text: 'guard', kind: 'change' })
  await clock.advance(500)
  expect(searched(ran).map(a => a.at(-1))).toEqual(['guard'])
  await ui.unmount()
})

test('a query starting with a dash goes after -e, and one letter is not searched', async ($, on) => {
  const { ui, clock, ran } = await open($, on)
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'g')
  expect(searched(ran)).toEqual([])
  expect(await hasText(ui, 'Type at least 2 characters to search inside files.')).toBe(true)
  await type(ui, clock, '--no-index')
  expect(searched(ran)[0]!.slice(-2)).toEqual(['-e', '--no-index'])
  await ui.unmount()
})

test('pressing a match shows the file in the preview on the page that holds the line; ← files returns to the matches', async ($, on) => {
  const { ui, clock } = await open($, on)
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'guard')
  await ui.press({ key: 'cm-src/big.ts:450' })
  await clock.settle()
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ path: 'C:/work/demo/src/big.ts', startLine: 401 })
  expect(await hasText(ui, 'lines 401–800 of 900')).toBe(true)
  await ui.press({ key: 'preview-back' })
  await clock.settle()
  expect(await hasText(ui, '4 matches in 3 files')).toBe(true)
  await ui.unmount()
})

test('Enter in the search box opens the first match', async ($, on) => {
  const { ui, clock } = await open($, on)
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'guard')
  await ui.input({ key: 'search', text: 'guard' })
  await clock.settle()
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ path: 'C:/work/demo/src/a.ts', startLine: 1 })
  await ui.unmount()
})

test('no match says so', async ($, on) => {
  const { ui, clock } = await open($, on, { grep: (argv: string[]) => (argv[0] === 'git' ? { stdout: '', exitCode: 1 } : undefined) })
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'nothing here')
  expect(await hasText(ui, 'No matches.')).toBe(true)
  await ui.unmount()
})

test('over 200 matches show the first 200 and say how many there were', async ($, on) => {
  const many = Array.from({ length: 250 }, (_, i) => `src/a.ts\x00${i + 1}\x00hit ${i}`).join('\n') + '\n'
  const { ui, clock } = await open($, on, { grep: (argv: string[]) => (argv[0] === 'git' ? { stdout: many } : undefined) })
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'hit')
  expect(await hasText(ui, '250 matches, the first 200 shown in 1 file')).toBe(true)
  const shown = (await ui.findAll({ type: 'Button' })).filter((b: any) => String(b.key).startsWith('cm-'))
  expect(shown).toHaveLength(200)
  await ui.unmount()
})

test('outside a repo it falls back to a recursive grep over the folder', async ($, on) => {
  const grep = (argv: string[]) => (argv[0] === 'grep' ? { stdout: './src/a.ts\x0012:const guard = 1\n' } : undefined)
  const { ui, clock, ran } = await open($, on, { git: undefined, grep })
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'guard')
  // The repo check already said no, so git is not asked again.
  expect(searched(ran).map(a => a[0])).toEqual(['grep'])
  expect(searched(ran)[0]).toContain('-r')
  expect(await hasText(ui, '1 match in 1 file')).toBe(true)
  expect(await ui.find({ key: 'cm-src/a.ts:12' })).toBeDefined()
  await ui.unmount()
})

test('when grep itself cannot run the search says so instead of showing nothing', async ($, on) => {
  const exits = (argv: string[]) => (argv[0] === 'grep' ? { exitCode: 127, stderr: 'grep: command not found' } : undefined)
  const { ui, clock } = await open($, on, { git: undefined, grep: () => undefined, exits })
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'guard')
  expect(await ui.find({ type: 'Text', text: /Could not search/ })).toBeDefined()
  expect(await hasText(ui, 'No matches.')).toBe(false)
  await ui.unmount()
})

test('turning Contents off goes back to file names with the same text', async ($, on) => {
  const { ui, clock } = await open($, on)
  await ui.press({ key: 'search-contents' })
  await type(ui, clock, 'guard')
  await ui.press({ key: 'search-contents' })
  await clock.advance(500)
  expect(await ui.find({ key: 'cm-src/a.ts:12' })).toBeUndefined()
  expect((await ui.find({ key: 'search' }))?.props?.placeholder).toBe('Search files')
  expect((await ui.find({ key: 'search' }))?.props?.value).toBe('guard')
  await ui.unmount()
})
