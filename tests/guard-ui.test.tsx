import { expect, test } from 'claude-code/testing'

import { PANE, START, hasText, pressRow, rowRuns, rowText, world } from './world'

const GUARDS_KEY = 'filetrail:guards'
const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file'], ['tmp', 'dir']],
  'C:/work/demo/src': [['a.ts', 'file']],
  'C:/work/demo/tmp': [['scratch.txt', 'file']],
}
const rowKey = (name: string) => `row-c:/work/demo/${name.toLowerCase()}`
const label = async (ui: any, key: string) => (await ui.find({ key }))?.props?.label

async function open($: any, on: any, guards: string[] = []) {
  const w = world(on, { dirs: DIRS, stored: guards.length ? { [GUARDS_KEY]: guards } : {} })
  await $.session.start(START)
  await w.clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  return { ...w, ui }
}

test('a guarded folder, and what is inside it, carry a red ✕; a row nothing guards does not', async ($, on) => {
  const { ui } = await open($, on, ['C:/work/demo/src'])
  expect(await rowText(ui, rowKey('src'))).toContain('✕')
  expect(await rowText(ui, rowKey('tmp'))).not.toContain('✕')
  expect(await rowText(ui, rowKey('README.md'))).not.toContain('✕')
  await pressRow(ui, rowKey('src'))
  expect(await rowText(ui, rowKey('src/a.ts'))).toContain('✕')
  const runs = await rowRuns(ui, rowKey('src'))
  expect(runs.find(r => r.text.includes('✕'))?.props.color).toBe('error')
  await ui.unmount()
})

test('Guard under the selected file guards it, and Lift guard lets it go', async ($, on) => {
  const { ui, store, toasts } = await open($, on)
  await pressRow(ui, rowKey('README.md'))
  expect(await label(ui, 'guard-file')).toBe('Guard')
  await ui.press({ key: 'guard-file' })
  expect(store.get(GUARDS_KEY)).toEqual(['C:/work/demo/README.md'])
  expect(toasts).toContain('filetrail: guarded README.md')
  expect(await rowText(ui, rowKey('README.md'))).toContain('✕')
  expect(await label(ui, 'guard-file')).toBe('Lift guard')
  await ui.press({ key: 'guard-file' })
  expect(store.get(GUARDS_KEY)).toEqual([])
  expect(toasts).toContain('filetrail: guard lifted from README.md')
  expect(await rowText(ui, rowKey('README.md'))).not.toContain('✕')
  await ui.unmount()
})

test('a file inside a guarded folder says which guard holds it, and has no button to lift it alone', async ($, on) => {
  const { ui } = await open($, on, ['C:/work/demo/src'])
  await pressRow(ui, rowKey('src'))
  await pressRow(ui, rowKey('src/a.ts'))
  expect(await ui.find({ key: 'guard-file' })).toBeUndefined()
  expect(await hasText(ui, 'guarded by src')).toBe(true)
  await ui.unmount()
})

test('Alt+click on a row, a folder too, guards it and lifts it again', async ($, on) => {
  const { ui, store, toasts } = await open($, on)
  await ui.post({ guard: true }, { in: rowKey('tmp') })
  expect(store.get(GUARDS_KEY)).toEqual(['C:/work/demo/tmp'])
  expect(toasts).toContain('filetrail: guarded tmp')
  expect(await rowText(ui, rowKey('tmp'))).toContain('✕')
  await ui.post({ guard: true }, { in: rowKey('tmp') })
  expect(store.get(GUARDS_KEY)).toEqual([])
  await ui.unmount()
})

test('a real Alt+click on a row guards it without selecting it or folding a folder; a plain click still selects', async ($, on) => {
  const { ui, store } = await open($, on)
  const alt = (key: string) => ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', alt: true, in: key })
  await alt(rowKey('README.md'))
  expect(store.get(GUARDS_KEY)).toEqual(['C:/work/demo/README.md'])
  expect(await label(ui, 'guard-file')).toBeUndefined()
  await alt(rowKey('src'))
  expect(await ui.find({ key: rowKey('src/a.ts') })).toBeUndefined()
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: rowKey('README.md') })
  expect(await label(ui, 'guard-file')).toBe('Lift guard')
  await ui.unmount()
})

test('Alt+click inside a guarded folder changes nothing and says which guard holds the row', async ($, on) => {
  const { ui, store, toasts } = await open($, on, ['C:/work/demo/src'])
  await pressRow(ui, rowKey('src'))
  await ui.post({ guard: true }, { in: rowKey('src/a.ts') })
  expect(store.get(GUARDS_KEY)).toEqual(['C:/work/demo/src'])
  expect(toasts).toContain('filetrail: src/a.ts is already guarded by src')
  await ui.unmount()
})
