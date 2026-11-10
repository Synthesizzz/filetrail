import { expect, test } from 'claude-code/testing'

import { barCells, crabPose, factsOf } from '../hooks/agents-view'
import type { Helper } from '../types'

const mate = (over: Partial<Helper> = {}): Helper => ({ id: 'a', type: 'developer', description: 'Do it', state: 'running', startedAt: 0, endedAt: null, calls: 0, files: [], ...over })

test('crabPose: thinking before the first file, then reading or writing as the last file says, cheering when done, sweating when failed', () => {
  expect(crabPose(mate())).toBe('think')
  expect(crabPose(mate({ files: [{ path: 'a', tone: 'read' }] }))).toBe('read')
  expect(crabPose(mate({ files: [{ path: 'a', tone: 'read' }, { path: 'b', tone: 'write' }] }))).toBe('write')
  expect(crabPose(mate({ state: 'done', files: [{ path: 'a', tone: 'write' }] }))).toBe('passed')
  expect(crabPose(mate({ state: 'failed' }))).toBe('failed')
})

test('barCells: the longest fills the bar, others in proportion, never less than a cell, always the same total', () => {
  expect(barCells(60_000, 60_000, 20)).toEqual({ on: 20, off: 0 })
  expect(barCells(30_000, 60_000, 20)).toEqual({ on: 10, off: 10 })
  expect(barCells(0, 60_000, 20)).toEqual({ on: 1, off: 19 })
  expect(barCells(0, 0, 20)).toEqual({ on: 1, off: 19 })
  expect(barCells(5, 10, 2)).toEqual({ on: 2, off: 2 })
})

test('factsOf: how it ended, the file it is on, how long, how many calls; "starting" before the first call', () => {
  expect(factsOf(mate(), 4100)).toBe('starting · 4.1s')
  expect(factsOf(mate({ calls: 1 }), 2000)).toBe('2.0s · 1 call')
  expect(factsOf(mate({ calls: 6, files: [{ path: 'C:/p/x/a.md', tone: 'write' }] }), 78_000)).toBe('✎ a.md · 1m 18s · 6 calls')
  expect(factsOf(mate({ state: 'done', endedAt: 5000, calls: 2, files: [{ path: 'C:/p/b.md', tone: 'read' }] }), 99_000)).toBe('done · ◉ b.md · 5.0s · 2 calls')
  expect(factsOf(mate({ state: 'failed', endedAt: 1000, calls: 1 }), 99_000)).toBe('failed · 1.0s · 1 call')
})
