import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { DONE, PANE, START, hasText, pressRow, world } from './world'

const FILES = { 'C:\\work\\demo\\a.ts': 'x\ngreet()\n', 'C:\\work\\demo\\denied.ts': 'x\n' }
const lastTurn = (history: Turn[][]): Turn => history.at(-1)!.at(-1)!

test('a refused or failed call of any tool is kept in its turn: who stopped it, the call and the reason', async ($, on) => {
  const { clock, history } = world(on, { files: FILES })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'try things' } as never)
  await $.tool.call({ tool: 'Bash', command: 'make release --hook-says-no' } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build --permission-says-no' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\missing.md' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\denied.ts', old_string: 'x', new_string: 'y' } as never)
  // A call that goes through is not kept.
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  const turn = lastTurn(history)
  expect(turn.blocked?.map(b => [b.kind, b.tool, b.call, b.reason])).toEqual([
    ['hook', 'Bash', 'make release --hook-says-no', 'Not now: the build is frozen.'],
    ['harness', 'Bash', 'rm -rf build --permission-says-no', "The user doesn't want to proceed with this tool use. The tool use was rejected."],
    ['failed', 'Read', 'C:\\work\\demo\\missing.md', 'File does not exist.'],
    ['harness', 'Edit', 'C:\\work\\demo\\denied.ts', 'The user refused this edit.'],
  ])
  // The refused Edit is still a step that says it was not applied.
  expect(turn.steps.map(s => [s.rel, s.status])).toEqual([['denied.ts', 'denied']])
})

test('a turn whose only trouble is blocked calls is saved, shows on the timeline, and opens to its list', async ($, on) => {
  const { clock, history } = world(on, { files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'ship it' } as never)
  await $.tool.call({ tool: 'Bash', command: 'make release --hook-says-no' } as never)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  expect(lastTurn(history)).toMatchObject({ id: 't1', steps: [], blocked: [{ kind: 'hook' }] })
  await ui.press({ key: 'tab-history' })
  expect(await hasText(ui, 'no file edits · 1 blocked')).toBe(true)
  await pressRow(ui, 'turn-t1')
  expect(await hasText(ui, 'No file edits in this turn.')).toBe(true)
  expect(await hasText(ui, 'BLOCKED · 1')).toBe(true)
  expect(await hasText(ui, 'refused (hook)')).toBe(true)
  expect(await hasText(ui, ' · Not now: the build is frozen.')).toBe(true)
  await ui.unmount()
})

test('a turn with edits and a blocked call lists the blocked call under the step', async ($, on) => {
  const { clock } = world(on, { files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'edit and fail' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\a.ts', old_string: 'greet', new_string: 'welcome' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\missing.md' } as never)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-t1')
  expect(await hasText(ui, 'BLOCKED · 1')).toBe(true)
  expect(await hasText(ui, 'failed')).toBe(true)
  await ui.unmount()
})

test('the card still shows a refused call for a moment, as before', async ($, on) => {
  const { clock } = world(on, { files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'x' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\denied.ts', old_string: 'x', new_string: 'y' } as never)
  expect(await hasText(ui, 'Edit denied · denied.ts')).toBe(true)
  await clock.advance(6000)
  expect(await hasText(ui, 'Edit denied · denied.ts')).toBe(false)
  await ui.unmount()
})
