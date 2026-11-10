import { expect, test } from 'claude-code/testing'

import type { Blocked, Step, Turn } from '../types'
import { SELECTED_BG } from '../hooks/files-view'
import { DOT_GLYPHS, QUIET_COLOR, SPINE_COLUMNS, railBars, summaryText, titleSegs } from '../hooks/history-view'
import { cells, wrapLines } from '../hooks/paths'
import { DONE, KEY, PANE, START, hasText, pressRow, rowText, world } from './world'

const NOW = new Date(2026, 9, 17, 17, 30).getTime()
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime()
const columns = (n: number) => ({ ...PANE, props: { ...PANE.props, bodyColumns: n } })

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id, path: `C:/work/demo/${id}.ts`, rel: `${id}.ts`, tool: 'Edit', note: '', status: 'ok', line: 3, add: 1, del: 0,
  diff: [{ op: '-', t: 'a' }, { op: '+', t: 'b' }], at: NOW, ...over,
})
const many = (id: string, n: number, over: Partial<Step> = {}) => Array.from({ length: n }, (_, i) => step(`${id}${i}`, over))
const hook: Blocked = { id: 'b1', tool: 'Bash', call: 'rm x', kind: 'hook', reason: 'no' }

// Oldest first, as stored: yesterday's big turn, then today's three.
const D: Turn = { id: 'tD', at: at(16, 10), prompt: 'a big refactor', steps: many('d', 10, { add: 4, del: 2 }) }
const A: Turn = { id: 'tA', at: at(17, 17, 0), prompt: 'add greet', steps: [step('a', { add: 5, del: 0 })] }
const B: Turn = { id: 'tB', at: at(17, 17, 20), prompt: 'rename greet', steps: [step('b0', { add: 2, del: 2 }), step('b1', { status: 'denied', add: 1, del: 1 }), step('b2', { add: 0, del: 3 })] }
const C: Turn = { id: 'tC', at: at(17, 17, 23), prompt: 'clean up', steps: [], blocked: [hook] }

/** The dots drawn, newest turn first: a Text that reads exactly one dot glyph, with its colour. */
const dots = async (ui: any): Promise<{ glyph: string; color: string | undefined }[]> =>
  (await ui.findAll({ type: 'Text' }))
    .filter((t: any) => (DOT_GLYPHS as readonly string[]).includes(t.text))
    .map((t: any) => ({ glyph: t.text, color: t.props?.color }))
/** The bars drawn under the dots, newest turn first: a Text made of bars alone. */
const bars = async (ui: any): Promise<string[]> =>
  (await ui.findAll({ type: 'Text' })).map((t: any) => t.text as string).filter(t => /^│(\n│)*$/.test(t))

test('every turn has a dot: its size by the edits, its colour by how the turn ended', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, B, C] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  // Newest first: C (no edit, one blocked call), B (3 edits, one not applied), A (1 edit), D (10 edits).
  expect(await dots(ui)).toEqual([
    { glyph: DOT_GLYPHS[0], color: 'warning' },
    { glyph: DOT_GLYPHS[2], color: 'error' },
    { glyph: DOT_GLYPHS[1], color: 'success' },
    { glyph: DOT_GLYPHS[3], color: 'success' },
  ])
  await ui.unmount()
})

test('a gap shows between turns from 8 minutes apart, and not across a day or between closer turns', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, B, C] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  // A started 20 minutes before B; B 3 minutes before C; D is on another day, under its own header.
  expect(await hasText(ui, '20 min earlier')).toBe(true)
  expect(await ui.find({ key: 'gap-tA' })).toBeDefined()
  expect(await ui.find({ key: 'gap-tB' })).toBeUndefined()
  expect(await ui.find({ key: 'gap-tD' })).toBeUndefined()
  expect(await hasText(ui, '3 min earlier')).toBe(false)
  await ui.unmount()
})

test('a day header carries what the day held', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, B, C] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  const day = async (id: string) => (await ui.findAll({ key: `day-${id}` }))[0]
  expect(await day('tC')).toBeDefined()
  expect(await day('tD')).toBeDefined()
  // Today: C, B and A are 3 turns; A added 5, B added 3 and removed 6, C touched no file.
  expect(await hasText(ui, 'TODAY')).toBe(true)
  expect(await hasText(ui, '3 turns')).toBe(true)
  expect(await hasText(ui, '+8')).toBe(true)
  expect(await hasText(ui, '-6')).toBe(true)
  // Yesterday: D alone, 10 steps of +4 -2.
  expect(await hasText(ui, 'YESTERDAY')).toBe(true)
  expect(await hasText(ui, '1 turn')).toBe(true)
  expect(await hasText(ui, '+40')).toBe(true)
  expect(await hasText(ui, '-20')).toBe(true)
  const run = async (t: string) => (await ui.findAll({ type: 'Text', text: t })).find(x => x.text === t)?.props?.color
  expect(await run('+8')).toBe('success')
  expect(await run('-6')).toBe('error')
  await ui.unmount()
})

test('the running turn is Claude\'s orange and still reads Now; pressing a row opens that turn', async ($, on) => {
  world(on, { files: { 'C:\\work\\demo\\a.ts': 'x\ngreet()\n' }, stored: { [KEY]: [A] }, now: NOW })
  await $.session.start(START)
  await $.turn.start({ text: 'rename greet', turnId: 'live' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\a.ts', old_string: 'greet', new_string: 'welcome' })
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  expect((await dots(ui))[0]).toEqual({ glyph: DOT_GLYPHS[1], color: 'claude' })
  expect(await rowText(ui, 'turn-live')).toBe('Now  rename greet')
  expect(await hasText(ui, 'working · a.ts · 1 edit · +1 -1')).toBe(true)
  await pressRow(ui, 'turn-live')
  expect(await hasText(ui, 'step 1 of 1')).toBe(true)
  await $.turn.complete({ ...DONE, turnId: 'live' })
  await ui.unmount()
})

test('the spine runs as high as the row: a long Thai prompt at 36 columns wraps in two lines and the bars follow', async ($, on) => {
  const thai = 'ทดสอบที่นี่'.repeat(40)
  const T: Turn = { id: 'tT', at: at(17, 17, 5), prompt: thai, steps: [step('t0', { rel: 'src/a.ts' })] }
  world(on, { stored: { [KEY]: [A, T] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...columns(36) })
  await ui.press({ key: 'tab-history' })

  const room = 36 - SPINE_COLUMNS
  const budget = Math.max(24, room * 2 - 4)
  const segs = titleSegs(T, NOW, null, false, budget)
  const title = segs.map(s => s.t).join('')
  const row = await rowText(ui, 'turn-tT')
  // Two lines of the column at most, and nearly full: cut by columns, so the tone marks that take none do not shorten it.
  expect(wrapLines(title, room)).toBe(2)
  expect(cells(row)).toBe(cells(title))
  expect(cells(row)).toBeGreaterThan(budget - 10)
  expect(cells(row)).toBeLessThanOrEqual(budget)
  expect(row.endsWith('…')).toBe(true)
  // The bars: a line for each line the title and the summary take, under the dot, and one more to the next dot.
  const lines = wrapLines(title, room) + wrapLines(summaryText(T), room)
  expect(lines).toBeGreaterThanOrEqual(3)
  const [barsT, barsA] = await bars(ui)
  expect(barsT).toBe(railBars(lines, true))
  // A is the first turn of the day: its bars stop at its own text.
  const titleA = titleSegs(A, NOW, null, false, budget).map(s => s.t).join('')
  expect(barsA).toBe(railBars(wrapLines(titleA, room) + wrapLines(summaryText(A), room), false))
  await ui.unmount()
})

test('a row\'s bars reach the next dot on the same day and stop at the last turn of a day', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, { ...C, at: at(17, 17, 5) }] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  // Each row's title and summary take a line apiece. C has A under it on its day; A and D have another day or nothing.
  expect(await bars(ui)).toEqual(['│\n│', '│', '│'])
  await ui.unmount()
})

test('wide: the list and the diff still sit side by side, and the picked row has a fill', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, B] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...columns(120) })
  await ui.press({ key: 'tab-history' })

  expect(await ui.find({ key: 'turn-tA' })).toBeDefined()
  expect(await ui.find({ key: 'turn-tB' })).toBeDefined()
  expect(await hasText(ui, 'step 1 of 3')).toBe(true)
  expect((await ui.find({ key: 'body-tB' }))?.props?.backgroundColor).toBe(SELECTED_BG)
  expect((await ui.find({ key: 'body-tA' }))?.props?.backgroundColor).toBeUndefined()

  await pressRow(ui, 'turn-tA')
  expect(await hasText(ui, 'step 1 of 1')).toBe(true)
  expect((await ui.find({ key: 'body-tA' }))?.props?.backgroundColor).toBe(SELECTED_BG)
  expect((await ui.find({ key: 'body-tB' }))?.props?.backgroundColor).toBeUndefined()
  await ui.unmount()
})

test('one page at a time has no fill on any row, and the dot colour of a quiet turn is grey', async ($, on) => {
  const quiet: Turn = { id: 'tQ', at: at(17, 17, 5), prompt: 'nothing', steps: [] }
  world(on, { stored: { [KEY]: [A, quiet] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  expect((await ui.find({ key: 'body-tA' }))?.props?.backgroundColor).toBeUndefined()
  expect(await dots(ui)).toEqual([{ glyph: DOT_GLYPHS[0], color: QUIET_COLOR }, { glyph: DOT_GLYPHS[1], color: 'success' }])
  await ui.unmount()
})

test('History with a spine draws on the terminal too', async ($, on) => {
  world(on, { stored: { [KEY]: [D, A, B, C] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-history' })
  expect(await dots(ui)).toHaveLength(4)
  expect(await hasText(ui, '20 min earlier')).toBe(true)
  await pressRow(ui, 'turn-tB')
  expect(await hasText(ui, 'step 1 of 3')).toBe(true)
  await ui.unmount()
})
