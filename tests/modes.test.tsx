import { expect, test } from 'claude-code/testing'

import type { ModesProps } from '../hooks/modes'
import { modeAt, modeLabels } from '../hooks/modes'
import { PANE, START, plain, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['a.ts', 'file'], ['b.ts', 'file']],
}
const FILES = { 'C:\\work\\demo\\src\\a.ts': 'a\n', 'C:\\work\\demo\\src\\b.ts': 'b\n' }
const words = (props: ModesProps) => modeLabels(props.mode, props.count ?? 0, props.plain === true).map(l => plain(l.text))
/** What the tabs' Client was given. */
async function tabs(ui: any): Promise<ModesProps | undefined> {
  return ((await ui.find({ key: 'tree-modes' }))?.props as any)?.props
}

test('modeLabels: one padded cell per view, Now with how many files it holds, brackets where no fill can be drawn', () => {
  expect(modeLabels('all', 0, false).map(l => plain(l.text))).toEqual([' All ', ' Now '])
  expect(modeLabels('now', 3, false).map(l => plain(l.text))).toEqual([' All ', ' Now 3 '])
  expect(modeLabels('all', 0, true).map(l => plain(l.text))).toEqual(['[All]', ' Now '])
  expect(modeLabels('now', 3, true).map(l => plain(l.text))).toEqual([' All ', '[Now 3]'])
  expect(modeLabels('all', 2, false).map(l => l.id)).toEqual(['all', 'now'])
  // The cells keep their width whichever is chosen, so the tabs never shift under the pointer.
  const widths = (mode: 'all' | 'now', plainMode: boolean) => modeLabels(mode, 3, plainMode).map(l => [...l.text].length)
  expect(widths('all', true)).toEqual(widths('now', true))
})

test('modeAt finds the cell under a column: the first, a gap of one, then the second', () => {
  const labels = modeLabels('all', 3, false)
  const first = [...labels[0]!.text].length
  expect(modeAt(0, labels)).toBe('all')
  expect(modeAt(first - 1, labels)).toBe('all')
  expect(modeAt(first, labels)).toBeUndefined()
  expect(modeAt(first + 1, labels)).toBe('now')
  expect(modeAt(first + 1 + [...labels[1]!.text].length, labels)).toBeUndefined()
})

test('the tree\'s views are tabs drawn by a Client: a press switches, the chosen one and the count follow', async ($, on) => {
  const { clock, store } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await tabs(ui)).toMatchObject({ mode: 'all', count: 0 })
  expect(words((await tabs(ui))!)).toEqual([' All ', ' Now '])

  await ui.post({ mode: 'now' }, { in: 'tree-modes' })
  await clock.settle()
  expect(store.get('filetrail:treeMode')).toBe('now')
  expect((await tabs(ui))?.mode).toBe('now')

  // Files Claude touches this turn: the count.
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\src\\b.ts' } as never)
  await clock.advance(200)
  expect(words((await tabs(ui))!)).toEqual([' All ', ' Now 2 '])

  await ui.post({ mode: 'all' }, { in: 'tree-modes' })
  await clock.settle()
  expect(store.get('filetrail:treeMode')).toBe('all')
  expect((await tabs(ui))?.mode).toBe('all')
  await ui.unmount()
})

test('on the terminal, which paints a fill opaque, the chosen view is bracketed instead', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  const props = await tabs(ui)
  expect(props?.plain).toBe(true)
  expect(words(props!)).toEqual(['[All]', ' Now '])
  await ui.unmount()
})
