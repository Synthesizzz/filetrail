import { expect, test } from './kit'

import { PANE, START, pressRow, rowRuns, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:/work/demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['deep', 'dir'], ['a.ts', 'file']],
  'C:/work/demo/src/deep': [['x.ts', 'file']],
}
const FILES = { 'C:/work/demo/README.md': '#\n', 'C:/work/demo/src/deep/x.ts': 'x\n', 'C:/work/demo/src/a.ts': 'a\n' }
const keys = async (ui: any) => (await ui.findAll({ type: 'Client' })).map((c: any) => String(c.key))

test('a row on show before Claude touched it is drawn fresh once lit, so its clock can start', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await keys(ui)).toContain('row-c:/work/demo/readme.md')
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/README.md' } as never)
  await clock.advance(200)
  // Lit: a new instance under a key of its tone, the old one gone.
  expect(await keys(ui)).toContain('row-c:/work/demo/readme.md~read')
  expect(await keys(ui)).not.toContain('row-c:/work/demo/readme.md')
  await ui.unmount()
})

test('every folder above Claude\'s file shimmers with it, in its tone; its word stays with the file', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/src/deep/x.ts' } as never)
  await clock.advance(200)
  const ks = await keys(ui)
  for (const k of ['row-c:/work/demo/src~read', 'row-c:/work/demo/src/deep~read', 'row-c:/work/demo/src/deep/x.ts~read']) expect([k, ks.includes(k)]).toEqual([k, true])
  // A file beside the path, not lit, stays as it was.
  expect(ks).toContain('row-c:/work/demo/src/a.ts')
  const src = await rowRuns(ui, 'row-c:/work/demo/src')
  expect(src.some(r => r.text.includes('reading'))).toBe(false)
  await ui.unmount()
})

test('a file git has nothing to say about keeps the plain colour, in a folder or at the root', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, 'row-c:/work/demo/src')
  const name = async (key: string, text: string) => (await rowRuns(ui, key)).find(r => r.text === text)?.props.color
  expect(await name('row-c:/work/demo/src/a.ts', 'a.ts')).toBeUndefined()
  expect(await name('row-c:/work/demo/readme.md', 'README.md')).toBeUndefined()
  await ui.unmount()
})
