import { expect, test } from 'claude-code/testing'

import { PANE, START, world } from './world'

const BIG = Array.from({ length: 900 }, (_, i) => `const x${i + 1} = ${i + 1}`).join('\n') + '\n'
const FILES: Record<string, string> = {
  'C:\\work\\demo\\src\\a.ts': 'one\n',
  'C:\\work\\demo\\src\\big.ts': BIG,
  'C:\\work\\demo\\README.md': '# Demo\n',
  'C:\\elsewhere\\x.ts': 'x\n',
}
const reply = (text: string, extra: object = {}) => ({ component: 'AssistantMessage', props: { text, isFirstOfReply: true, ...extra } }) as const

async function open($: any, on: any, text: string, surface: 'desktop' | 'terminal' = 'desktop', extra: object = {}) {
  const w = world(on, { files: FILES })
  await $.session.start(START)
  await w.clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...reply(text, extra) })
  return { ...w, ui }
}
const links = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => [b.key, b.props?.label])

test('a reply naming a file with a line gets a link under it, and the reply itself is still drawn', async ($, on) => {
  const { ui } = await open($, on, 'The check is in src/a.ts:1 and the loop in src/big.ts:450-460.')
  expect(await links(ui)).toEqual([['ref-src/a.ts:1', 'src/a.ts:1'], ['ref-src/big.ts:450-460', 'src/big.ts:450-460']])
  // The engine's own drawing of the reply stays above the links.
  expect((await ui.findAll({})).some((el: any) => el.type === 'engine')).toBe(true)
  await ui.unmount()
})

test('the links are there on the terminal too', async ($, on) => {
  const { ui } = await open($, on, 'See src/a.ts:1', 'terminal')
  expect(await links(ui)).toEqual([['ref-src/a.ts:1', 'src/a.ts:1']])
  await ui.unmount()
})

test('a reference to a file that is not there, one outside the project, a URL and a bare file name get no link', async ($, on) => {
  const { ui } = await open($, on, 'src/gone.ts:3, C:/elsewhere/x.ts:1, https://example.com/a.ts:9, README.md and src/a.ts')
  expect(await links(ui)).toEqual([])
  await ui.unmount()
})

test('a reply with no reference is left as the engine draws it', async ($, on) => {
  const { ui } = await open($, on, 'Nothing to point at here.')
  expect(await links(ui)).toEqual([])
  expect((await ui.findAll({})).every((el: any) => el.type === 'engine')).toBe(true)
  await ui.unmount()
})

test('a block that only summarises the reply gets no links', async ($, on) => {
  const { ui } = await open($, on, 'Looked at src/a.ts:1', 'desktop', { isSummary: true })
  expect(await links(ui)).toEqual([])
  await ui.unmount()
})

test('an absolute path inside the project, in Windows or forward-slash spelling, links to the same file once', async ($, on) => {
  const { ui } = await open($, on, 'C:\\work\\demo\\src\\a.ts:1 and C:/work/demo/src/a.ts:1 and ./README.md:1')
  expect((await links(ui)).map((l: any) => l[0])).toEqual(['ref-src/a.ts:1', 'ref-readme.md:1'])
  await ui.unmount()
})

test('pressing a link opens the pane on Files with the file shown on the page that holds the line', async ($, on) => {
  const { ui, clock, opens } = await open($, on, 'The loop is src/big.ts:450')
  await ui.press({ key: 'ref-src/big.ts:450' })
  await clock.settle()
  await ui.unmount()
  expect(opens.some((o: any) => o.id === 'filetrail')).toBe(true)
  const pane = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect((await pane.find({ type: 'Code' }))?.props).toMatchObject({ path: 'C:/work/demo/src/big.ts', startLine: 401 })
  await pane.unmount()
})

test('a link pressed while the pane shows History turns it to Files', async ($, on) => {
  const { ui, clock } = await open($, on, 'The loop is src/big.ts:450')
  const pane = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pane.press({ key: 'tab-history' })
  await clock.settle()
  expect(await pane.find({ key: 'tab-history' })).toMatchObject({ props: { variant: 'primary' } })
  await ui.press({ key: 'ref-src/big.ts:450' })
  await clock.settle()
  expect(await pane.find({ key: 'tab-files' })).toMatchObject({ props: { variant: 'primary' } })
  expect((await pane.find({ type: 'Code' }))?.props).toMatchObject({ startLine: 401 })
  await pane.unmount()
  await ui.unmount()
})

test('at most 20 links are drawn for one reply', async ($, on) => {
  const many = Array.from({ length: 30 }, (_, i) => `src/a.ts:${i + 1}`).join(' ')
  const { ui } = await open($, on, many)
  expect(await links(ui)).toHaveLength(20)
  await ui.unmount()
})
