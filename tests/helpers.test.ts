import { expect, test } from 'claude-code/testing'

import { MAX_HELPERS, MAX_HELPER_FILES, called, elapsed, finished, joined, nameOf, reconciled, running, strip } from '../hooks/helpers'
import type { Helper } from '../types'

const mate = (over: Partial<Helper> = {}): Helper => ({ id: 'a', type: 'Explore', description: 'Read the notes', state: 'running', startedAt: 100, endedAt: null, calls: 0, files: [], ...over })

test('joined: a helper starts running; a known one takes the type and task it was spawned with', () => {
  const one = joined([], { id: 'a', type: 'Explore', description: 'Read the notes' }, 100)
  expect(one).toEqual([mate()])
  const again = joined(called(one, 'a', 120, { path: 'C:/p/a.md', tone: 'read' }), { id: 'a', type: 'Plan', description: 'Plan it' }, 130)
  expect(again).toHaveLength(1)
  expect(again[0]).toMatchObject({ type: 'Plan', description: 'Plan it', calls: 1, startedAt: 100 })
})

test('called: counts a tool and keeps the file it named; a write outranks a read; a helper not seen start joins plain', () => {
  let list = joined([], { id: 'a', type: 'Explore', description: 'x' }, 100)
  list = called(list, 'a', 110, { path: 'C:/p/a.md', tone: 'read' })
  list = called(list, 'a', 111)
  list = called(list, 'a', 112, { path: 'c:/P/A.md', tone: 'write' })
  expect(list[0]).toMatchObject({ calls: 3, files: [{ path: 'C:/p/a.md', tone: 'write' }] })
  // A write is not taken back by a later read.
  list = called(list, 'a', 113, { path: 'C:/p/a.md', tone: 'read' })
  expect(list[0]!.files).toEqual([{ path: 'C:/p/a.md', tone: 'write' }])
  const stray = called([], 'z', 200, { path: 'C:/p/b.md', tone: 'read' })
  expect(stray).toEqual([mate({ id: 'z', type: 'subagent', description: '', startedAt: 200, calls: 1, files: [{ path: 'C:/p/b.md', tone: 'read' }] })])
})

test('called: a helper keeps its newest files only', () => {
  let list = joined([], { id: 'a', type: 'Explore', description: '' }, 1)
  for (let k = 0; k < MAX_HELPER_FILES + 5; k++) list = called(list, 'a', 2 + k, { path: `C:/p/f${k}.md`, tone: 'read' })
  expect(list[0]!.files).toHaveLength(MAX_HELPER_FILES)
  expect(list[0]!.files[0]!.path).toBe('C:/p/f5.md')
  expect(list[0]!.calls).toBe(MAX_HELPER_FILES + 5)
})

test('finished: done when it answered, failed otherwise, with the time it ended', () => {
  const list = joined(joined([], { id: 'a', type: 'Explore', description: '' }, 100), { id: 'b', type: 'Plan', description: '' }, 100)
  const after = finished(finished(list, 'a', 150, true), 'b', 160, false)
  expect(after.map(h => [h.id, h.state, h.endedAt])).toEqual([['a', 'done', 150], ['b', 'failed', 160]])
  expect(finished([], 'q', 5, true)).toEqual([mate({ id: 'q', type: 'subagent', description: '', state: 'done', startedAt: 5, endedAt: 5 })])
})

test('reconciled: joins a helper never seen, closes one the engine says is over, leaves what was counted alone', () => {
  const list = called(joined([], { id: 'a', type: 'Explore', description: 'x' }, 100), 'a', 110, { path: 'C:/p/a.md', tone: 'read' })
  const out = reconciled(list, [
    { id: 'a', type: 'Explore', description: 'x', status: 'completed' },
    { id: 'b', type: 'Plan', description: 'older', status: 'running' },
    { id: 'c', type: 'general-purpose', description: 'gone', status: 'killed' },
  ], 300)
  expect(out[0]).toMatchObject({ id: 'a', state: 'done', endedAt: 300, calls: 1, startedAt: 100 })
  expect(out[1]).toMatchObject({ id: 'b', state: 'running', endedAt: null, type: 'Plan' })
  expect(out[2]).toMatchObject({ id: 'c', state: 'failed', endedAt: 300 })
  // Asked again, nothing moves.
  expect(reconciled(out, [{ id: 'a', type: 'Explore', description: 'x', status: 'completed' }], 400)).toEqual(out)
  // A helper this module closed is not reopened by a stale list.
  const closed = finished(list, 'a', 150, true)
  expect(reconciled(closed, [{ id: 'a', type: 'Explore', description: 'x', status: 'running' }], 500)[0]).toMatchObject({ state: 'done', endedAt: 150 })
})

test('the list is capped: finished helpers go first, then the oldest', () => {
  let list: Helper[] = []
  for (let k = 0; k < MAX_HELPERS; k++) list = joined(list, { id: `h${k}`, type: 'Explore', description: '' }, k)
  list = finished(list, 'h3', 999, true)
  list = joined(list, { id: 'new', type: 'Explore', description: '' }, 1000)
  expect(list).toHaveLength(MAX_HELPERS)
  expect(list.some(h => h.id === 'h3')).toBe(false)
  expect(list.at(-1)!.id).toBe('new')
  expect(list[0]!.id).toBe('h0')
})

test('elapsed runs to the end, or to now while it works', () => {
  expect(elapsed(mate({ startedAt: 100 }), 1100)).toBe(1000)
  expect(elapsed(mate({ startedAt: 100, endedAt: 600, state: 'done' }), 9999)).toBe(500)
  expect(elapsed(mate({ startedAt: 100 }), 50)).toBe(0)
})

test('strip names the two newest helpers at work and counts the rest; finished ones are not in it', () => {
  const ids = ['a', 'b', 'c', 'd']
  let list: Helper[] = []
  for (const id of ids) list = joined(list, { id, type: 'Explore', description: id }, 1)
  list = finished(list, 'b', 5, true)
  expect(running(list).map(h => h.id)).toEqual(['a', 'c', 'd'])
  const s = strip(list)
  expect(s.shown.map(h => h.id)).toEqual(['d', 'c'])
  expect(s.more).toBe(1)
  expect(strip([])).toEqual({ shown: [], more: 0 })
})

test('nameOf: type and task on one line, cut long', () => {
  expect(nameOf(mate())).toBe('Explore · Read the notes')
  expect(nameOf(mate({ description: '' }))).toBe('Explore')
  expect(nameOf(mate({ description: 'x'.repeat(80) }), 20)).toHaveLength(20)
})
