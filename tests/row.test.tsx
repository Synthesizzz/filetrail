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
  expect(line).toMatch(/^ {2}a-rather-long-fil…$/)
  await ui.resize({ columns: 80, rows: 1, in: key })
  expect(await rowText(ui, key)).toBe('  a-rather-long-file-name-for-a-narrow-dock.tsx')
  await ui.unmount()
})
