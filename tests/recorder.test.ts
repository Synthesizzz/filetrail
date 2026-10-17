import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { DONE, KEY, START, world } from './world'

const edit = (file: string) => ({ tool: 'Edit' as const, file_path: `C:\\work\\demo\\${file}`, old_string: 'greet', new_string: 'welcome' })

test('a turn saves each edit with how it ended, under the project key', async ($, on) => {
  const { history, store } = world(on, { files: { 'C:\\work\\demo\\a.ts': 'x\ngreet()\n' } })
  await $.session.start(START)
  await $.turn.start({ text: 'rename greet to welcome\nplease', turnId: 't1' })
  await $.tool.call(edit('a.ts'))
  await $.tool.call(edit('denied.ts'))
  await $.tool.call(edit('broken.ts'))
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\a.ts' })
  await $.turn.complete({ ...DONE, turnId: 't1' })

  const saved = store.get(KEY) as Turn[]
  expect(saved.length).toBe(1)
  expect(saved[0]!.prompt).toBe('rename greet to welcome')
  expect(saved[0]!.steps.map(s => [s.rel, s.status])).toEqual([
    ['a.ts', 'ok'], ['denied.ts', 'denied'], ['broken.ts', 'failed'],
  ])
  expect(saved[0]!.steps[0]!.line).toBe(2)
  const index = store.get('index') as Record<string, { bytes: number }>
  expect(index[KEY]!.bytes).toBeGreaterThan(0)
  expect(history.at(-1)?.length).toBe(1)
})

test('an edit outside the project is not recorded and leaves no turn', async ($, on) => {
  const { store } = world(on)
  await $.session.start(START)
  await $.turn.start({ text: 'write the commit message', turnId: 't1' })
  await $.tool.call({ tool: 'Write' as const, file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\msg.txt', content: 'feat: x\n' })
  await $.turn.complete({ ...DONE, turnId: 't1' })
  expect(store.get(KEY)).toBeUndefined()
})

test('turns without edits and subagent completions add nothing', async ($, on) => {
  const { store } = world(on)
  await $.session.start(START)
  await $.turn.start({ text: 'just a question', turnId: 't1' })
  await $.turn.complete({ ...DONE, turnId: 't1' })
  expect(store.get(KEY)).toBeUndefined()

  await $.turn.start({ text: 'edit', turnId: 't2' })
  await $.tool.call(edit('a.ts'))
  await $.turn.complete({ ...DONE, turnId: 'sub', agentId: 'agent-1' })
  expect(store.get(KEY)).toBeUndefined()
  await $.turn.complete({ ...DONE, turnId: 't2' })
  expect((store.get(KEY) as Turn[]).length).toBe(1)
})

test('history saved by an earlier session loads at start', async ($, on) => {
  const earlier: Turn[] = [{ id: 'old', at: 1, prompt: 'earlier work', steps: [] }]
  const { history } = world(on, { stored: { [KEY]: earlier } })
  await $.session.start(START)
  expect(history.at(-1)?.map(t => t.prompt)).toEqual(['earlier work'])
})
