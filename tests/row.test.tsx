import { expect, test } from 'claude-code/testing'

import { fitRow } from '../hooks/row'
import type { Seg } from '../hooks/row'
import { PANE, START, rowText, world } from './world'

const text = (segs: Seg[]) => segs.map(s => s.t).join('')
const LIT: Seg[] = [
  { t: '    ', mono: true },
  { t: 'a-rather-long-file-name.tsx', sh: ['#000'] },
  { t: ' · reading', sh: ['#000'] },
  { t: ' ●10' },
  { t: ' +3' },
  { t: ' -1' },
]

test('fitRow leaves a row that fits, or one not laid out yet, alone', () => {
  expect(fitRow(LIT, 200)).toEqual(LIT)
  expect(fitRow(LIT, 0)).toEqual(LIT)
})

test('fitRow cuts the name first, keeping the counts while the name has room', () => {
  const out = fitRow(LIT, 40)
  expect(text(out).length).toBeLessThanOrEqual(40)
  expect(out[1]!.t.endsWith('…')).toBe(true)
  expect(text(out)).toMatch(/ · reading ●10 \+3 -1$/)
})

test('fitRow drops the counts from the end before cutting the name below 8, and keeps the tone word', () => {
  const out = fitRow(LIT, 24)
  expect(text(out).length).toBeLessThanOrEqual(24)
  expect(out[1]!.t.length).toBe(8)
  expect(out[2]!.t).toBe(' · reading')
  expect(out.length).toBeLessThan(LIT.length)
  // Tighter still, the name gives way too, down to a letter and the ellipsis.
  const tight = fitRow(LIT, 17)
  expect(text(tight).length).toBeLessThanOrEqual(17)
  // 17 columns less the indent (4) and the word (10) leave 3 for the name.
  expect(tight.map(s => s.t)).toEqual(['    ', 'a-…', ' · reading'])
})

test('fitRow can drop the ◂ marker of a quiet row, which is not a tone word', () => {
  const quiet: Seg[] = [{ t: '  ' }, { t: 'notes-about-the-thing.md' }, { t: ' ◂' }, { t: ' ●2' }]
  expect(fitRow(quiet, 12).map(s => s.t)).toEqual(['  ', 'notes-a…', ' ◂'])
  expect(fitRow(quiet, 10).map(s => s.t)).toEqual(['  ', 'notes-a…'])
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['a-rather-long-file-name-for-a-narrow-dock.tsx', 'file']],
}

test('a narrow row fits its region: the Client is as wide as the pane and cuts its name', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const key = 'row-c:/work/demo/a-rather-long-file-name-for-a-narrow-dock.tsx'
  expect((await ui.find({ key }))?.props?.width).toBe('100%')
  await ui.resize({ columns: 20, rows: 1, in: key })
  const line = await rowText(ui, key)
  expect([...line].length).toBeLessThanOrEqual(20)
  expect(line).toMatch(/^ {2}· a-rather-long-f…$/)
  await ui.resize({ columns: 80, rows: 1, in: key })
  expect(await rowText(ui, key)).toBe('  · a-rather-long-file-name-for-a-narrow-dock.tsx')
  await ui.unmount()
})

test('right-hand runs sit after a spacer, at the row\'s edge', async ($, on) => {
  const { clock } = world(on, { dirs: { 'C:\\work\\demo': [['a.ts', 'file']] }, git: { top: 'C:/work/demo', status: '## main\0?? a.ts\0', numstat: '' } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  const tree = await ui.drawn({ in: 'row-c:/work/demo/a.ts' })
  const kids = (tree as any).children ?? (tree as any).props?.children
  const types = kids.map((k: any) => (k.props?.flexGrow ? 'spacer' : k.props?.flexShrink === 0 ? 'badges' : 'left'))
  // The left side (indent, icon, name) clips; the spacer; the badges keep their width.
  expect(types).toEqual(['left', 'spacer', 'badges'])
  expect(kids[0].props).toMatchObject({ flexShrink: 1, overflow: 'hidden' })
  await ui.unmount()
})

test('fitRow drops a file\'s time before cutting the name, and finds the name by its mark', () => {
  const row: Seg[] = [{ t: '  ' }, { t: '· ' }, { t: 'notes-about-it.md', name: true }, { t: ' Oct 16 10:00', right: true, opt: true }]
  expect(text(fitRow(row, 40))).toBe('  · notes-about-it.md Oct 16 10:00')
  expect(fitRow(row, 22).map(s => s.t)).toEqual(['  ', '· ', 'notes-about-it.md'])
  expect(fitRow(row, 14).map(s => s.t)).toEqual(['  ', '· ', 'notes-abo…'])
})
