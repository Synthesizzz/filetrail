import { expect, test } from './kit'

import type { DiffLine, Step, Turn } from '../types'
import { diffLineText, diffParts, ADD_BG, DEL_BG } from '../hooks/history-view'
import { NBSP } from '../hooks/paths'
import { KEY, PANE, START, hasText, plain, pressRow, world } from './world'

const NOW = new Date(2026, 9, 17, 17, 30).getTime()
const columns = (n: number) => ({ ...PANE, props: { ...PANE.props, bodyColumns: n } })

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id, path: `C:/work/demo/${id}.ts`, rel: `src/${id}.ts`, tool: 'Edit', note: '', status: 'ok', line: 98, add: 2, del: 1,
  diff: [{ op: ' ', t: 'keep' }, { op: '-', t: '    old()' }, { op: '+', t: '    new()' }, { op: '+', t: 'more' }], at: NOW, ...over,
})
const E: Turn = { id: 'tE', at: NOW, prompt: 'edit things', steps: [step('a'), step('b', { status: 'denied' })] }

// B9.1: the left column and the code of one diff line.

test('diffParts: number, then the mark, in non-breaking spaces; the code keeps its indent', () => {
  const add = diffParts({ op: '+', t: '    const x = 1' }, '7', 3)
  expect(add.left).toBe(`${NBSP}${NBSP}7${NBSP}+`)
  expect(add.code).toBe(`${NBSP.repeat(4)}const x = 1`)
  expect(add.width).toBe(5)
  expect(diffParts({ op: '-', t: 'x' }, '12', 3).left).toBe(`${NBSP}12${NBSP}-`)
  expect(diffParts({ op: ' ', t: 'x' }, '100', 3).left).toBe(`100${NBSP}${NBSP}`)
})

test('diffParts: a skipped run has no number and a blank mark; no numbers at all leaves the mark alone', () => {
  const skip = diffParts({ op: '~', t: '⋯' }, '', 3)
  expect(skip.left).toBe(NBSP.repeat(5))
  expect(skip.code).toBe('⋯')
  const bare = diffParts({ op: '+', t: 'a' }, '', 0)
  expect(bare.left).toBe('+')
  expect(bare.width).toBe(1)
})

test('diffParts: every row of one diff has the same left width, whatever it holds', () => {
  const diff: DiffLine[] = [{ op: ' ', t: 'a' }, { op: '-', t: 'b' }, { op: '+', t: 'c' }, { op: '~', t: '⋯' }, { op: '+', t: 'd' }]
  const nums = ['98', '99', '99', '', '']
  const parts = diff.map((l, k) => diffParts(l, nums[k]!, 3))
  expect(new Set(parts.map(p => p.width))).toEqual(new Set([5]))
  expect(parts.every(p => p.left.length === p.width)).toBe(true)
})

test('diffLineText is kept: the old single-text form of a line', () => {
  expect(diffLineText({ op: '+', t: '  const x = 1' }, '7', 3)).toBe(`${NBSP.repeat(2)}7${NBSP}+${NBSP}${NBSP.repeat(2)}const x = 1`)
})

// B9.2: a diff row is two columns, so a wrapped line sits under its first line.

const gutters = async (ui: any) => (await ui.findAll({})).filter((e: any) => String(e.key).startsWith('diff-gutter-'))
const codes = async (ui: any) => (await ui.findAll({})).filter((e: any) => String(e.key).startsWith('diff-code-'))

test('each diff row is a left column of one width and a code column that wraps', async ($, on) => {
  world(on, { stored: { [KEY]: [E] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...columns(36) })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tE')

  // Lines 98, 99 and 99 then 100: the widest number has 3 digits, so the left column is 3 + space + mark = 5.
  const left = await gutters(ui)
  expect(left).toHaveLength(4)
  expect(left.map((g: any) => g.props.width)).toEqual([5, 5, 5, 5])
  expect(left.every((g: any) => g.props.flexShrink === 0)).toBe(true)
  const code = await codes(ui)
  expect(code).toHaveLength(4)
  expect(code.every((c: any) => c.props.flexGrow === 1 && c.props.minWidth === 0)).toBe(true)
  // The code is a Text of its own that wraps, beside a left column that holds the number and the mark.
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => plain(t.text))
  expect(texts).toContain(' 99 -')
  expect(texts).toContain('    old()')
  const wrapped = (await ui.findAll({ type: 'Text' })).find((t: any) => plain(t.text) === '    old()')
  expect(wrapped?.props?.wrap).toBe('wrap')
  await ui.unmount()
})

test('a long line of code at 36 columns stays in the code column and does not widen the left one', async ($, on) => {
  const long = 'x'.repeat(200)
  const T: Turn = { id: 'tL', at: NOW, prompt: 'long', steps: [step('l', { diff: [{ op: '+', t: long }, { op: '+', t: 'short' }] })] }
  world(on, { stored: { [KEY]: [T] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...columns(36) })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tL')
  const left = await gutters(ui)
  expect(left.map((g: any) => g.props.width)).toEqual([4, 4])
  const code = await codes(ui)
  expect(code.every((c: any) => c.props.minWidth === 0 && c.props.flexShrink === 1)).toBe(true)
  await ui.unmount()
})

test('a diff of over 20 lines folds, Show all opens it and Show fewer folds it again', async ($, on) => {
  const diff: DiffLine[] = Array.from({ length: 25 }, (_, i) => ({ op: '+' as const, t: `line ${i}` }))
  const T: Turn = { id: 'tF', at: NOW, prompt: 'big', steps: [step('f', { diff, add: 25, del: 0 })] }
  world(on, { stored: { [KEY]: [T] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tF')
  expect(await gutters(ui)).toHaveLength(20)
  expect(await ui.find({ key: 'show-all' })).toBeDefined()
  await ui.press({ key: 'show-all' })
  expect(await gutters(ui)).toHaveLength(25)
  expect(await ui.find({ key: 'show-fewer' })).toBeDefined()
  await ui.press({ key: 'show-fewer' })
  expect(await gutters(ui)).toHaveLength(20)
  await ui.unmount()
})

test('a step with no line changes says so and draws no rows', async ($, on) => {
  const T: Turn = { id: 'tN', at: NOW, prompt: 'nothing', steps: [step('n', { diff: [], add: 0, del: 0 })] }
  world(on, { stored: { [KEY]: [T] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tN')
  expect(await gutters(ui)).toHaveLength(0)
  expect(await hasText(ui, '  (no line changes)')).toBe(true)
  await ui.unmount()
})

// B9.3: a framed card with the file as its head, and a tint on added and removed rows on the desktop alone.

test('desktop: the step is a round frame; added rows have a green tint, removed rows a red one, kept rows none', async ($, on) => {
  world(on, { stored: { [KEY]: [E] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tE')

  const card = await ui.find({ key: 'step-card' })
  expect(card?.props?.borderStyle).toBe('round')
  const rows = (await ui.findAll({})).filter((e: any) => String(e.key).startsWith('diff-row-'))
  expect(rows.map((r: any) => r.props.backgroundColor)).toEqual([undefined, DEL_BG, ADD_BG, ADD_BG])
  await ui.unmount()
})

test('terminal: the frame is drawn and no row has a tint', async ($, on) => {
  world(on, { stored: { [KEY]: [E] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tE')

  expect((await ui.find({ key: 'step-card' }))?.props?.borderStyle).toBe('round')
  const rows = (await ui.findAll({})).filter((e: any) => String(e.key).startsWith('diff-row-'))
  expect(rows).toHaveLength(4)
  expect(rows.every((r: any) => r.props.backgroundColor === undefined)).toBe(true)
  // The colour of the text carries the diff there.
  const run = (await ui.findAll({ type: 'Text' })).find((t: any) => plain(t.text) === '    new()')
  expect(run?.props?.color).toBe('success')
  await ui.unmount()
})

test('the card head: the file is a button that opens the file across turns; Show in Files and View file stay', async ($, on) => {
  const T2: Turn = { id: 'tE2', at: NOW - 3_600_000, prompt: 'earlier', steps: [step('a')] }
  world(on, { stored: { [KEY]: [T2, E] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tE')
  expect(await ui.find({ key: 'reveal' })).toBeDefined()
  expect(await ui.find({ key: 'view-file' })).toBeDefined()
  expect(plain((await ui.find({ key: 'file-filter' }))?.text)).toBe('src/a.ts')
  await ui.press({ key: 'file-filter' })
  expect(await hasText(ui, 'src/a.ts · 2 edits across 2 turns')).toBe(true)
  expect(await ui.find({ key: 'step-card' })).toBeDefined()
  await ui.unmount()
})

test('the card says why a step was not applied, or that it has no answer', async ($, on) => {
  const T: Turn = {
    id: 'tS', at: NOW, prompt: 'states',
    steps: [step('d', { status: 'denied' }), step('f', { status: 'failed' }), step('p', { status: 'pending' })],
  }
  world(on, { stored: { [KEY]: [T] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tS')
  const colour = async (t: string) => (await ui.findAll({ type: 'Text', text: t })).find((x: any) => x.text === t)?.props?.color
  expect(await colour('denied')).toBe('error')
  expect((await ui.find({ key: 'step-card' }))?.props?.borderColor).toBe('error')
  await ui.press({ key: 'next' })
  expect(await colour('failed')).toBe('warning')
  expect((await ui.find({ key: 'step-card' }))?.props?.borderColor).toBe('warning')
  await ui.press({ key: 'next' })
  expect(await colour('no answer')).toBe('warning')
  await ui.unmount()
})

test('Prev, Next and Ask Claude stay under the card; the step count stays above it', async ($, on) => {
  world(on, { stored: { [KEY]: [E] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-tE')
  const keys = (await ui.findAll({})).map((e: any) => e.key)
  const at = (k: string) => keys.indexOf(k)
  expect(at('step-card')).toBeGreaterThan(at('strip'))
  expect(at('nav')).toBeGreaterThan(at('step-card'))
  expect(at('prev')).toBeGreaterThan(at('step-card'))
  expect(at('ask')).toBeGreaterThan(at('step-card'))
  expect(await hasText(ui, 'step 1 of 2')).toBe(true)
  await ui.unmount()
})

// B9.4: widths and the turns the card does not draw.

for (const width of [36, 60, 120]) {
  test(`${width} columns: the card, its head and its rows are all drawn`, async ($, on) => {
    world(on, { stored: { [KEY]: [E] }, now: NOW })
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...columns(width) })
    await ui.press({ key: 'tab-history' })
    if (width < 100) await pressRow(ui, 'turn-tE')
    expect(await ui.find({ key: 'step-card' })).toBeDefined()
    expect(await ui.find({ key: 'file-filter' })).toBeDefined()
    expect(await ui.find({ key: 'meta' })).toBeDefined()
    expect(await gutters(ui)).toHaveLength(4)
    expect(await hasText(ui, 'step 1 of 2')).toBe(true)
    // Wide keeps the list on the left beside the card.
    expect(Boolean(await ui.find({ key: 'turn-tE' }))).toBe(width >= 100)
    await ui.unmount()
  })
}

test('a turn with only blocked calls draws no card and still lists them; one with both draws both', async ($, on) => {
  const hook = { id: 'b1', tool: 'Bash', call: 'rm x', kind: 'hook' as const, reason: 'no' }
  const only: Turn = { id: 'tO', at: NOW - 600_000, prompt: 'blocked only', steps: [], blocked: [hook] }
  const both: Turn = { id: 'tB', at: NOW, prompt: 'edit and blocked', steps: [step('a')], blocked: [hook] }
  world(on, { stored: { [KEY]: [only, both] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  await pressRow(ui, 'turn-tO')
  expect(await ui.find({ key: 'step-card' })).toBeUndefined()
  expect(await hasText(ui, 'No file edits in this turn.')).toBe(true)
  expect(await ui.find({ key: 'blocked' })).toBeDefined()

  await ui.press({ key: 'back' })
  await pressRow(ui, 'turn-tB')
  expect(await ui.find({ key: 'step-card' })).toBeDefined()
  expect(await ui.find({ key: 'blocked' })).toBeDefined()
  await ui.unmount()
})
