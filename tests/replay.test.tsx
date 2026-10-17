import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { hintFor, hintText } from '../hooks/band'
import { FOLD_LINES } from '../hooks/history-view'
import { DONE, KEY, PANE, START, hasText, world } from './world'

const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const FILES = { 'C:\\work\\demo\\a.ts': 'x\ngreet()\n' }
const edit = (file: string) => ({ tool: 'Edit' as const, file_path: `C:\\work\\demo\\${file}`, old_string: 'greet', new_string: 'welcome' })

/** A plugin beneath that draws in the band too, as token-usage does. */
function beneathBand(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, (b: any, e: any) => {
    const { Text } = b.ui.resolve(e)
    return Text({ children: 'beneath' })
  })
}

test('hintFor counts edits and distinct files; none for a turn without edits', () => {
  const s = (path: string): Step => ({ id: path, path, rel: path, tool: 'Edit', note: '', status: 'ok', line: 1, add: 1, del: 0, diff: [], at: 0 })
  const turn: Turn = { id: 't9', at: 0, prompt: '', steps: [s('C:/w/a.ts'), s('c:/W/A.ts'), s('C:/w/b.ts')] }
  expect(hintFor(turn)).toEqual({ turn: 't9', edits: 3, files: 2 })
  expect(hintText({ turn: 't9', edits: 1, files: 1 })).toBe('▶ filetrail: 1 edit in 1 file')
  expect(hintFor({ ...turn, steps: [] })).toBe(null)
})

test('after a turn with edits the band offers a replay, under what the plugins beneath draw', async ($, on) => {
  world(on, { files: FILES })
  beneathBand(on)
  await $.session.start(START)
  await $.turn.start({ text: 'rename', turnId: 't1' })
  await $.tool.call(edit('a.ts'))
  await $.tool.call(edit('a.ts'))
  await $.turn.complete({ ...DONE, turnId: 't1' })

  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...BAND })
  expect(await hasText(ui, 'beneath')).toBe(true)
  expect(await hasText(ui, '▶ filetrail: 2 edits in 1 file')).toBe(true)
  expect(await ui.find({ key: 'replay' })).toBeDefined()

  // A turn that changes nothing keeps the offer.
  await $.turn.start({ text: 'a question', turnId: 't2' })
  await $.turn.complete({ ...DONE, turnId: 't2' })
  expect(await hasText(ui, '▶ filetrail: 2 edits in 1 file')).toBe(true)
  await ui.unmount()
})

test('a survey has the band to itself', async ($, on) => {
  world(on, { files: FILES })
  beneathBand(on)
  await $.session.start(START)
  await $.turn.start({ text: 'rename', turnId: 't1' })
  await $.tool.call(edit('a.ts'))
  await $.turn.complete({ ...DONE, turnId: 't1' })
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await hasText(ui, 'beneath')).toBe(true)
  expect(await ui.find({ key: 'replay' })).toBeUndefined()
  await ui.unmount()
})

test('Replay opens that turn in History with the keys, and the offer goes', async ($, on) => {
  const { clock, opens } = world(on, { files: FILES })
  // In a session the engine draws beneath every band hook; in a test something must.
  beneathBand(on)
  await $.session.start(START)
  await clock.settle()
  opens.length = 0
  await $.turn.start({ text: 'rename', turnId: 't1' })
  await $.tool.call(edit('a.ts'))
  await $.tool.call(edit('a.ts'))
  await $.turn.complete({ ...DONE, turnId: 't1' })

  const band = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...BAND })
  await band.press({ key: 'replay' })
  await clock.advance(300)
  expect(await band.find({ key: 'replay' })).toBeUndefined()
  expect(opens).toEqual([{ id: 'filetrail', title: 'Trail: demo', focus: true, closeOnEscape: true }])
  await band.unmount()

  const pane = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await hasText(pane, 'step 1 of 2')).toBe(true)
  // Close closes the pane.
  await pane.press({ key: 'close' })
  await pane.unmount()
})

test('/trail replay opens the latest turn, or says there is none', async ($, on) => {
  const latest: Turn = { id: 'last', at: new Date(2026, 9, 17, 17, 5).getTime(), prompt: 'latest', steps: [] }
  const { clock, opens } = world(on, { stored: { [KEY]: [{ id: 'old', at: 1, prompt: 'old', steps: [] }, latest] } })
  await $.session.start(START)
  await clock.settle()
  opens.length = 0
  const run = $.command.run({ ...TYPED, command: 'trail', args: 'replay' })
  await clock.advance(300)
  expect((await run).text).toBe('filetrail: replaying 0 edits from 2026-10-17 17:05.')
  expect(opens).toEqual([{ id: 'filetrail', title: 'Trail: demo', focus: true, closeOnEscape: true }])
})

test('/trail replay with no history', async ($, on) => {
  world(on)
  await $.session.start(START)
  const r = await $.command.run({ ...TYPED, command: 'trail', args: 'replay' })
  expect(r.text).toBe('filetrail: no edits recorded in this project yet.')
})

test('Close closes the pane', async ($, on) => {
  const turn: Turn = { id: 't1', at: 1, prompt: 'p', steps: [{ id: 's', path: 'C:/work/demo/a.ts', rel: 'a.ts', tool: 'Edit', note: '', status: 'ok', line: 1, add: 1, del: 0, diff: [{ op: '+', t: 'x' }], at: 1 }] }
  const { closes } = world(on, { stored: { [KEY]: [turn] } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'turn-t1' })
  await ui.press({ key: 'close' })
  expect(closes).toEqual([expect.objectContaining({ id: 'filetrail' })])
  await ui.unmount()
})

test(`a long diff folds at ${FOLD_LINES} lines; Show all unfolds it until another step`, async ($, on) => {
  const long = Array.from({ length: FOLD_LINES + 10 }, (_, k) => ({ op: '+' as const, t: `line ${k}` }))
  const s = (id: string, diff: Step['diff']): Step => ({ id, path: 'C:/work/demo/a.ts', rel: 'a.ts', tool: 'Write', note: 'new file', status: 'ok', line: null, add: diff.length, del: 0, diff, at: 1 })
  const turn: Turn = { id: 't1', at: 1, prompt: 'p', steps: [s('a', long), s('b', [{ op: '+', t: 'short' }])] }
  world(on, { stored: { [KEY]: [turn] } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'turn-t1' })

  expect(await hasText(ui, `+ line ${FOLD_LINES - 1}`)).toBe(true)
  expect(await hasText(ui, `+ line ${FOLD_LINES}`)).toBe(false)
  expect((await ui.find({ key: 'show-all' }))?.text).toBe('Show all (10 more lines)')

  await ui.press({ key: 'show-all' })
  expect(await hasText(ui, `+ line ${FOLD_LINES + 9}`)).toBe(true)
  expect(await ui.find({ key: 'show-fewer' })).toBeDefined()

  await ui.press({ key: 'next' })
  await ui.press({ key: 'prev' })
  expect(await hasText(ui, `+ line ${FOLD_LINES}`)).toBe(false)
  await ui.unmount()
})
