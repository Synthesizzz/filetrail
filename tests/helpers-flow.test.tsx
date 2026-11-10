import { expect, test } from 'claude-code/testing'

import type { Helper } from '../types'
import { DONE, START, world } from './world'

const helpersOf = (states: Record<string, unknown[]>): Helper[] => (states.helpers?.at(-1) ?? []) as Helper[]
const spawn = async ($: any, description: string, subagentType = 'Explore') => {
  const r = await $.agent.spawn({ prompt: `Do this: ${description}`, description, subagentType })
  return String(r.agentId)
}

test('a helper that starts is listed; its calls and files are counted; its turn ends it', async ($, on) => {
  const { states, clock } = world(on, { files: { 'C:\\work\\demo\\a.md': '# a\n' } })
  await $.session.start(START)
  await clock.settle()
  const id = await spawn($, 'Read the notes')
  expect(helpersOf(states)).toMatchObject([{ id, type: 'Explore', description: 'Read the notes', state: 'running', calls: 0, files: [] }])
  // The helper's own calls carry its id; the main loop's carry none and are not counted.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\a.md', agentId: id } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'C:\\work\\demo', agentId: id } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\b.md' } as never)
  expect(helpersOf(states)[0]).toMatchObject({ calls: 2, files: [{ path: 'C:/work/demo/a.md', tone: 'read' }] })
  await clock.advance(5000)
  await $.turn.complete({ ...DONE, agentId: id } as never)
  expect(helpersOf(states)[0]).toMatchObject({ state: 'done' })
  expect(helpersOf(states)[0]!.endedAt! - helpersOf(states)[0]!.startedAt).toBeGreaterThanOrEqual(5000)
})

test('a helper keeps a file only if its call went through; a turn that failed marks it failed; another turn of it works again', async ($, on) => {
  const { states, clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const id = await spawn($, 'Edit things', 'general-purpose')
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\missing.md', agentId: id } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\denied.ts', old_string: 'a', new_string: 'b', agentId: id } as never)
  expect(helpersOf(states)[0]).toMatchObject({ calls: 2, files: [] })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\new.ts', content: 'x', agentId: id } as never)
  expect(helpersOf(states)[0]!.files).toEqual([{ path: 'C:/work/demo/new.ts', tone: 'write' }])
  await $.turn.complete({ ...DONE, reason: 'error', agentId: id } as never)
  expect(helpersOf(states)[0]!.state).toBe('failed')
  await $.turn.start({ turnId: 'h2', text: 'more', agentId: id } as never)
  expect(helpersOf(states)[0]).toMatchObject({ state: 'running', endedAt: null })
})

test('a helper turn is not a main turn: it neither clears the Now tree nor ends the working state', async ($, on) => {
  const { states, clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  const id = await spawn($, 'Look')
  await $.turn.start({ turnId: 'h1', text: 'look', agentId: id } as never)
  await $.turn.complete({ ...DONE, agentId: id } as never)
  expect((states.working ?? []).at(-1)).toBe(true)
})

test('a reload reads the engine\'s own list: helpers started before it join, running or over', async ($, on) => {
  const { states, clock } = world(on, {
    agents: [
      { id: 'old1', type: 'Plan', description: 'Plan the move', status: 'running' },
      { id: 'old2', type: 'Explore', description: 'Read docs', status: 'completed' },
    ],
  })
  await $.session.start(START)
  await clock.settle()
  expect(helpersOf(states).map(h => [h.id, h.type, h.state])).toEqual([['old1', 'Plan', 'running'], ['old2', 'Explore', 'done']])
})

test('a spawn that was refused lists nothing', async ($, on) => {
  const { states, clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const r = await $.agent.spawn({ prompt: 'x', description: 'Look --refuse', subagentType: 'Explore' })
  expect(r.deny).toBe('No helpers here.')
  expect(helpersOf(states)).toEqual([])
})

test('a helper the engine says is over, when no turn of its own ended it, is closed as the main turn ends', async ($, on) => {
  const w = world(on, {})
  await $.session.start(START)
  await w.clock.settle()
  const id = await spawn($, 'Look around')
  w.agents.push({ id, type: 'Explore', description: 'Look around', status: 'killed' })
  expect(helpersOf(w.states)[0]!.state).toBe('running')
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await $.turn.complete({ ...DONE } as never)
  expect(helpersOf(w.states)[0]).toMatchObject({ state: 'failed' })
})

test('a spawn with neither a task nor a prompt still goes through and is listed by its type', async ($, on) => {
  const { states, clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const r = await $.agent.spawn({ subagentType: 'Plan' } as never)
  expect(r.agentId).toBeDefined()
  expect(helpersOf(states)).toMatchObject([{ type: 'Plan', description: '', state: 'running' }])
})
