import { expect, test } from './kit'

import { crabPose, factsOf, ganttCells, grouped, modelName } from '../hooks/agents-view'
import type { Helper } from '../types'

const mate = (over: Partial<Helper> = {}): Helper => ({ id: 'a', type: 'developer', description: 'Do it', state: 'running', startedAt: 0, endedAt: null, calls: 0, files: [], ...over })
/** factsOf with its no-break spaces read as plain ones, for the tests about what it says. */
const flat = (s: string) => s.replace(/ /g, ' ')

test('crabPose: thinking before the first file, then reading or writing as the last file says, cheering when done, sweating when failed', () => {
  expect(crabPose(mate())).toBe('think')
  expect(crabPose(mate({ files: [{ path: 'a', tone: 'read' }] }))).toBe('read')
  expect(crabPose(mate({ files: [{ path: 'a', tone: 'read' }, { path: 'b', tone: 'write' }] }))).toBe('write')
  expect(crabPose(mate({ state: 'done', files: [{ path: 'a', tone: 'write' }] }))).toBe('passed')
  expect(crabPose(mate({ state: 'failed' }))).toBe('failed')
})

test("ganttCells: a helper's span on its group's axis, at least one cell, always the same total", () => {
  // The whole axis: all on.
  expect(ganttCells(0, 60_000, 0, 60_000, 20)).toEqual({ lead: 0, on: 20, tail: 0 })
  // The second half of the axis.
  expect(ganttCells(30_000, 60_000, 0, 60_000, 20)).toEqual({ lead: 10, on: 10, tail: 0 })
  // The first quarter.
  expect(ganttCells(0, 15_000, 0, 60_000, 20)).toEqual({ lead: 0, on: 5, tail: 15 })
  // A blink at the very end still gets a cell, inside the total.
  expect(ganttCells(60_000, 60_000, 0, 60_000, 20)).toEqual({ lead: 19, on: 1, tail: 0 })
  // A short span on a very long axis (a helper sent more hours later stretched it).
  expect(ganttCells(1000, 2000, 0, 3_600_000, 20)).toEqual({ lead: 0, on: 1, tail: 19 })
  // An axis of no length: the bar is full.
  expect(ganttCells(5, 5, 5, 5, 12)).toEqual({ lead: 0, on: 12, tail: 0 })
  // Never fewer than four cells.
  const tiny = ganttCells(0, 10, 0, 10, 2)
  expect(tiny.lead + tiny.on + tiny.tail).toBe(4)
})

test('modelName: the family and version, short; an alias by its family; anything else cut short', () => {
  expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelName('claude-fable-5-2')).toBe('Fable 5.2')
  expect(modelName('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet')
  expect(modelName('us.anthropic.claude-sonnet-5-5-v1:0')).toBe('Sonnet 5.5')
  expect(modelName('haiku')).toBe('Haiku')
  expect(modelName('some-local-model-of-ours')).toBe('some-local-mode…')
  expect(modelName('')).toBe('')
  expect(modelName(undefined)).toBe('')
})

test("grouped: a group per main turn, the newest on top; in a group by start time, a helper's own under it, deeper each level", () => {
  const list = [
    mate({ id: 'old', turn: 't1', startedAt: 10 }),
    mate({ id: 'b', turn: 't2', startedAt: 200 }),
    mate({ id: 'a', turn: 't2', startedAt: 100 }),
    mate({ id: 'a1', turn: 't2', parentId: 'a', startedAt: 150 }),
    mate({ id: 'a1x', turn: 't2', parentId: 'a1', startedAt: 160 }),
    mate({ id: 'a1xy', turn: 't2', parentId: 'a1x', startedAt: 170 }),
  ]
  const g = grouped(list)
  expect(g.map(x => x.turn)).toEqual(['t2', 't1'])
  expect(g[0]!.rows.map(r => [r.mate.id, r.depth])).toEqual([['a', 0], ['a1', 1], ['a1x', 2], ['a1xy', 3], ['b', 0]])
  expect(g[1]!.rows.map(r => r.mate.id)).toEqual(['old'])
})

test('grouped: a child spawned in a later turn stays with its parent; a missing parent makes it a top row; a loop is broken', () => {
  const g = grouped([
    mate({ id: 'mom', turn: 't1', startedAt: 10 }),
    mate({ id: 'kid', turn: 't5', parentId: 'mom', startedAt: 900 }),
    mate({ id: 'orphan', turn: 't5', parentId: 'gone', startedAt: 800 }),
    mate({ id: 'self', turn: 't5', parentId: 'self', startedAt: 850 }),
    mate({ id: 'x', turn: 't5', parentId: 'y', startedAt: 860 }),
    mate({ id: 'y', turn: 't5', parentId: 'x', startedAt: 870 }),
    mate({ id: 'z', turn: 't5', parentId: 'x', startedAt: 880 }),
  ])
  expect(g.map(x => x.turn)).toEqual(['t5', 't1'])
  expect(g[1]!.rows.map(r => [r.mate.id, r.depth])).toEqual([['mom', 0], ['kid', 1]])
  // Each helper shows once; those in a loop stand on their own, one hanging off the loop stays under it.
  expect(g[0]!.rows.map(r => [r.mate.id, r.depth])).toEqual([['orphan', 0], ['self', 0], ['x', 0], ['z', 1], ['y', 0]])
})

test('grouped: helpers with no turn (read back after a reload) are one group, always last', () => {
  const g = grouped([mate({ id: 'r1', startedAt: 5000 }), mate({ id: 'n', turn: 't1', startedAt: 10 }), mate({ id: 'r2', startedAt: 4000 })])
  expect(g.map(x => x.turn)).toEqual(['t1', undefined])
  expect(g[1]!.rows.map(r => r.mate.id)).toEqual(['r2', 'r1'])
  expect(grouped([])).toEqual([])
})

test('factsOf: how it ended, the file it is on, how long, how many calls; "starting" before the first call', () => {
  expect(flat(factsOf(mate(), 4100))).toBe('starting · 4.1s')
  expect(flat(factsOf(mate({ calls: 1 }), 2000))).toBe('2.0s · 1 call')
  expect(flat(factsOf(mate({ calls: 6, files: [{ path: 'C:/p/x/a.md', tone: 'write' }] }), 78_000))).toBe('✎ a.md · 1m 18s · 6 calls')
  expect(flat(factsOf(mate({ state: 'done', endedAt: 5000, calls: 2, files: [{ path: 'C:/p/b.md', tone: 'read' }] }), 99_000))).toBe('done · ◉ b.md · 5.0s · 2 calls')
  expect(flat(factsOf(mate({ state: 'failed', endedAt: 1000, calls: 1 }), 99_000))).toBe('failed · 1.0s · 1 call')
})

test('factsOf: a narrow pane breaks the line only between facts, never inside "2 calls" or "◉ b.md"', () => {
  const line = factsOf(mate({ model: 'claude-haiku-5-5', state: 'done', endedAt: 78_000, calls: 2, files: [{ path: 'C:/p/b c.md', tone: 'read' }] }), 99_000)
  expect(line.split(' · ')).toEqual(['Haiku\u00a05.5', 'done', '◉\u00a0b\u00a0c.md', '1m\u00a018s', '2\u00a0calls'])
})

test('factsOf: the model it runs on comes first, when known', () => {
  expect(flat(factsOf(mate({ model: 'claude-haiku-5-5', calls: 1 }), 2000))).toBe('Haiku 5.5 · 2.0s · 1 call')
  expect(flat(factsOf(mate({ model: 'claude-opus-5-5', state: 'done', endedAt: 5000, calls: 2 }), 9000))).toBe('Opus 5.5 · done · 5.0s · 2 calls')
})
