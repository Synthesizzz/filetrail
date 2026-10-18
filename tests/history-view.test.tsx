import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { stepsFor } from '../hooks/history'
import { TONE_SHIMMER } from '../hooks/files-view'
import { dayLabel, formatAt, gutter, stepsOf, summaryText, TIME_COLOR, titleSegs, withoutIgnored } from '../hooks/history-view'
import { KEY, PANE, START, hasText, pressRow, rowRuns, rowText, world } from './world'

const ROOT = 'C:\\work\\demo'
// Built from local time parts, so the expected clock text holds in any timezone.
const NOW = new Date(2026, 9, 17, 17, 5).getTime()
const YESTERDAY = new Date(2026, 9, 16, 10, 0).getTime()
const TODAY = new Date(2026, 9, 17, 17, 0).getTime()

function made(steps: Step[], status: Step['status'] = 'ok'): Step[] {
  return steps.map(s => ({ ...s, status }))
}

const T1: Turn = {
  id: 't1', at: YESTERDAY, prompt: 'add greet',
  steps: made(stepsFor({ tool: 'Write', file_path: `${ROOT}\\src\\a.ts`, content: 'x\ngreet()\n' }, null, ROOT, YESTERDAY, 't1.0')),
}
const T2: Turn = {
  id: 't2', at: TODAY, prompt: 'rename greet to welcome',
  steps: [
    ...made(stepsFor({ tool: 'Edit', file_path: `${ROOT}\\src\\a.ts`, old_string: 'greet', new_string: 'welcome' }, 'x\ngreet()\n', ROOT, TODAY, 't2.0')),
    ...made(stepsFor({ tool: 'Edit', file_path: `${ROOT}\\src\\denied.ts`, old_string: 'greet', new_string: 'welcome' }, 'greet\n', ROOT, TODAY, 't2.1'), 'denied'),
  ],
}

test('titleSegs: marker when selected, time in blue, "Now" shimmering while live, prompt cut to the budget', () => {
  const saved = titleSegs(T2, NOW, null, false, 200)
  expect(saved.map(s => s.t.replace(/ /g, ' '))).toEqual(['17:00', '  rename greet to welcome'])
  expect(saved[0]!.c).toBe(TIME_COLOR)
  const live = titleSegs(T2, NOW, 't2', true, 200)
  expect(live[0]).toMatchObject({ t: '› ', c: 'claude' })
  expect(live[1]).toMatchObject({ t: 'Now', c: 'claude', sh: TONE_SHIMMER.write })
  expect(live[2]!.b).toBe(true)
  const cut = titleSegs(T2, NOW, null, false, 24)
  expect(cut.map(s => s.t).join('').length).toBeLessThanOrEqual(24)
})

test('formatAt: clock today, month and day otherwise', () => {
  expect(formatAt(TODAY, NOW)).toBe('17:00')
  expect(formatAt(YESTERDAY, NOW)).toBe('Oct 16 10:00')
})

test('dayLabel: today, yesterday, then the date (with the year once it is another)', () => {
  expect(dayLabel(TODAY, NOW)).toBe('Today')
  expect(dayLabel(YESTERDAY, NOW)).toBe('Yesterday')
  expect(dayLabel(new Date(2026, 9, 14, 9, 0).getTime(), NOW)).toBe('Oct 14')
  expect(dayLabel(new Date(2025, 11, 31, 9, 0).getTime(), NOW)).toBe('Dec 31, 2025')
})

test('withoutIgnored leaves out steps on files git ignores, and turns left with none', () => {
  const notes: Turn = {
    id: 't3', at: TODAY, prompt: 'log it',
    steps: made(stepsFor({ tool: 'Write', file_path: `${ROOT}\\PROGRESS.md`, content: 'x\n' }, null, ROOT, TODAY, 't3.0')),
  }
  const ignored = ['c:/work/demo/progress.md', 'c:/work/demo/src/denied.ts']
  const { turns, hidden } = withoutIgnored([T1, T2, notes], ignored)
  expect(turns.map(t => t.id)).toEqual(['t1', 't2'])
  expect(turns[1]!.steps.map(s => s.rel)).toEqual(['src/a.ts'])
  expect(hidden).toBe(1)
  expect(withoutIgnored([T1], []).turns[0]).toBe(T1)
})

test('History leaves out turns that only touched files git ignores, and says how many', async ($, on) => {
  const notes: Turn = {
    id: 't3', at: TODAY, prompt: 'log it',
    steps: made(stepsFor({ tool: 'Write', file_path: `${ROOT}\\PROGRESS.md`, content: 'x\n' }, null, ROOT, TODAY, 't3.0')),
  }
  const { clock } = world(on, {
    stored: { [KEY]: [T1, T2, notes] }, now: NOW,
    git: { top: 'C:/work/demo', status: '## main\0', numstat: '', ignored: 'PROGRESS.md\n' },
  })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  const rows = (await ui.findAll({ type: 'Client' })).map(b => b.key).filter(k => k?.startsWith('turn-'))
  expect(rows).toEqual(['turn-t2', 'turn-t1'])
  expect(await hasText(ui, '2 turns · 1 hidden (git-ignored files)')).toBe(true)
  await ui.unmount()
})

test('gutter numbers old lines for kept and removed, new for added, and stops after a gap', () => {
  const diff = [
    { op: ' ' as const, t: 'a' }, { op: '-' as const, t: 'b' }, { op: '+' as const, t: 'B' }, { op: ' ' as const, t: 'c' },
    { op: '~' as const, t: '⋯' }, { op: '+' as const, t: 'z' },
  ]
  expect(gutter(diff, 10)).toEqual(['10', '11', '11', '12', '', ''])
  expect(gutter(diff, null)).toEqual(['', '', '', '', '', ''])
})

test('summaryText names up to two files, counts more, and stepsOf', () => {
  expect(summaryText(T2)).toBe('a.ts · denied.ts · 2 edits · +2 -2 · 1 not applied')
  expect(summaryText(T1)).toBe('a.ts · 1 edit · +2 -0')
  const many: Turn = { ...T2, steps: ['a', 'b', 'c'].flatMap(n => made(stepsFor({ tool: 'Write', file_path: `${ROOT}\\${n}.ts`, content: 'x\n' }, null, ROOT, TODAY, `m.${n}`))) }
  expect(summaryText(many)).toBe('3 files · 3 edits · +3 -0')
  expect(stepsOf([T1, T2], { turn: 't2', file: null, step: 0 }).map(p => p.step.rel)).toEqual(['src/a.ts', 'src/denied.ts'])
  expect(stepsOf([T1, T2], { turn: null, file: 'c:/WORK/demo/src/a.ts', step: 0 }).map(p => p.turn.id)).toEqual(['t1', 't2'])
  expect(stepsOf([T1, T2], { turn: 'gone', file: null, step: 0 })).toEqual([])
})

// Long: every step of a turn and a file across turns, near the default 5 s on a loaded machine.
test('History: timeline, a turn step by step, and a file across turns', { timeoutMs: 15_000 }, async ($, on) => {
  world(on, { stored: { [KEY]: [T1, T2] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })

  // The timeline, newest first.
  const rows = (await ui.findAll({ type: 'Client' })).map(b => b.key).filter(k => k?.startsWith('turn-'))
  expect(rows).toEqual(['turn-t2', 'turn-t1'])
  // A header for each day; the turns under it show the clock alone.
  expect(await hasText(ui, 'TODAY')).toBe(true)
  expect(await hasText(ui, 'YESTERDAY')).toBe(true)
  expect(await rowText(ui, 'turn-t2')).toMatch(/^17:00\s+rename greet to welcome$/)
  expect(await rowText(ui, 'turn-t1')).toMatch(/^10:00\s+add greet$/)
  expect(await hasText(ui, 'a.ts · denied.ts · 2 edits · +2 -2 · 1 not applied')).toBe(true)
  // Colour, which a Button would drop: the time in blue in the row's Client, the counts in the summary.
  expect((await rowRuns(ui, 'turn-t2')).find(r => r.text === '17:00')?.props.color).toBe(TIME_COLOR)
  // A text query matches within longer texts too, so take the run that reads exactly so.
  const run = async (text: string) => (await ui.findAll({ type: 'Text', text })).find(t => t.text === text)?.props?.color
  expect(await run('+2')).toBe('success')
  expect(await run('-2')).toBe('error')
  expect(await run(' · 1 not applied')).toBe('warning')

  // One turn, step by step.
  await pressRow(ui, 'turn-t2')
  expect(await ui.find({ type: 'Text', text: /step 1 of 2/ })).toBeDefined()
  expect(await rowText(ui, 'file-filter')).toBe('src/a.ts')
  expect(await hasText(ui, '2 - greet')).toBe(true)
  expect(await hasText(ui, '2 + welcome')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /line 2/ })).toBeDefined()

  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /step 2 of 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'denied' })).toBeDefined()
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /step 2 of 2/ })).toBeDefined()
  await ui.press({ key: 'cell-0' })
  expect(await ui.find({ type: 'Text', text: /step 1 of 2/ })).toBeDefined()

  // The file across turns, oldest first.
  await ui.press({ key: 'file-filter' })
  expect(await ui.find({ type: 'Text', text: 'src/a.ts · 2 edits across 2 turns' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Write · new file/ })).toBeDefined()
  await ui.press({ key: 'to-turn' })
  expect(await ui.find({ type: 'Text', text: /add greet/ })).toBeDefined()

  // Back to the timeline; the Files tab and back keep the place.
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'turn-t1' })).toBeDefined()
  await pressRow(ui, 'turn-t1')
  await ui.press({ key: 'tab-files' })
  await ui.press({ key: 'tab-history' })
  expect(await ui.find({ type: 'Text', text: /add greet/ })).toBeDefined()
  await ui.unmount()
})

test('History draws on the terminal too', async ($, on) => {
  world(on, { stored: { [KEY]: [T1, T2] }, now: NOW })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-t2')
  expect(await hasText(ui, '2 + welcome')).toBe(true)
  await ui.unmount()
})
