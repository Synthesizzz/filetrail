import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { statusLabel, turnTitle } from '../hooks/history-view'
import { DONE, KEY, PANE, START, hasText, world, pressRow, rowText } from './world'

const FILES = { 'C:\\work\\demo\\a.ts': 'x\ngreet()\n' }
const edit = (file: string) => ({ tool: 'Edit' as const, file_path: `C:\\work\\demo\\${file}`, old_string: 'greet', new_string: 'welcome' })
const AT = new Date(2026, 9, 17, 17, 5).getTime()

test('statusLabel: a step with no answer yet is running while its turn is live', () => {
  const s = { status: 'pending' } as Step
  expect(statusLabel(s, true)).toBe('running…')
  expect(statusLabel(s, false)).toBe('no answer')
  expect(statusLabel({ status: 'ok' } as Step, true)).toBe('')
  const t: Turn = { id: 't1', at: AT, prompt: 'rename', steps: [] }
  expect(turnTitle(t, AT, 't1')).toBe('Now  rename')
  expect(turnTitle(t, AT, null)).toBe('17:05  rename')
})

test('the running turn is shown live: written with the step before the tool answers, then with its result', async ($, on) => {
  const { states } = world(on, { files: FILES })
  await $.session.start(START)
  await $.turn.start({ text: 'rename greet', turnId: 't1' })
  await $.tool.call(edit('a.ts'))

  const lives = (states.live ?? []).filter(Boolean) as Turn[]
  expect(lives.length).toBe(2)
  expect(lives[0]!.steps.map(s => s.status)).toEqual(['pending'])
  expect(lives[1]!.steps.map(s => s.status)).toEqual(['ok'])

  await $.turn.complete({ ...DONE, turnId: 't1' })
  expect(states.live!.at(-1)).toBe(null)
})

test('the timeline shows Now on top while the turn runs, then the saved turn in its place', async ($, on) => {
  const earlier: Turn = { id: 'old', at: AT, prompt: 'earlier work', steps: [] }
  world(on, { files: FILES, stored: { [KEY]: [earlier] }, now: AT })
  await $.session.start(START)
  await $.turn.start({ text: 'rename greet', turnId: 't1' })
  await $.tool.call(edit('a.ts'))

  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  const rows = (await ui.findAll({ type: 'Client' })).map(b => b.key).filter(k => k?.startsWith('turn-'))
  expect(rows).toEqual(['turn-t1', 'turn-old'])
  expect((await rowText(ui, 'turn-t1'))).toBe('Now  rename greet')
  expect(await hasText(ui, 'working · 1 file · 1 edit · +1 -1')).toBe(true)
  expect(await hasText(ui, '1 turn · 1 running')).toBe(true)

  // Open the running turn, then let it end: the view stays on it, now with its time.
  await pressRow(ui, 'turn-t1')
  expect(await hasText(ui, 'step 1 of 1')).toBe(true)
  await $.turn.complete({ ...DONE, turnId: 't1' })
  expect(await hasText(ui, 'step 1 of 1')).toBe(true)
  expect(await hasText(ui, 'Now  rename greet')).toBe(false)

  await ui.press({ key: 'back' })
  expect((await rowText(ui, 'turn-t1'))).toMatch(/^\d\d:\d\d\s+rename greet$/)
  expect(await hasText(ui, '2 turns')).toBe(true)
  await ui.unmount()
})

test('a session start clears a Now row a reload left behind', async ($, on) => {
  const { states } = world(on)
  await $.session.start(START)
  expect(states.live).toEqual([null])
})
