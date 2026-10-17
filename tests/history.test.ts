import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { capDiff, diffLines } from '../hooks/diff'
import {
  addTurn, byteSize, firstLine, lineOf, outcomeOf, planBudget, projectKey, relTo, stepsFor, trimTurnsToBytes,
} from '../hooks/history'

test('diffLines keeps one line of context and marks skipped runs', () => {
  const before = 'a\nb\nc\nd\ne\nf\n'
  const after = 'a\nB\nc\nd\ne\nF\n'
  expect(diffLines(before, after)).toEqual([
    { op: ' ', t: 'a' }, { op: '-', t: 'b' }, { op: '+', t: 'B' }, { op: ' ', t: 'c' },
    { op: '~', t: '⋯' },
    { op: ' ', t: 'e' }, { op: '-', t: 'f' }, { op: '+', t: 'F' },
  ])
  expect(diffLines('same\n', 'same\n')).toEqual([])
  expect(diffLines('x\r\ny\r\n', 'x\ny\n')).toEqual([])
})

test('diffLines falls back to removed-then-added past 400 lines', () => {
  const big = Array.from({ length: 401 }, (_, k) => `l${k}`).join('\n')
  const d = diffLines(big, 'new')
  expect(d.length).toBe(402)
  expect(d[0]).toEqual({ op: '-', t: 'l0' })
  expect(d[401]).toEqual({ op: '+', t: 'new' })
})

test('capDiff says how many lines it dropped', () => {
  const d = Array.from({ length: 5 }, (_, k) => ({ op: '+' as const, t: String(k) }))
  expect(capDiff(d, 3)).toEqual([...d.slice(0, 3), { op: '~', t: '… 2 more lines' }])
  expect(capDiff(d, 5)).toBe(d)
})

test('paths: keys fold case, rel strips the root on Windows paths', () => {
  expect(projectKey('C:\\Work\\Demo\\')).toBe('p:c:/work/demo')
  expect(relTo('C:\\work\\demo', 'c:\\Work\\demo\\src\\a.ts')).toBe('src/a.ts')
  expect(relTo('C:/work/demo', 'D:/other/b.ts')).toBe('D:/other/b.ts')
  expect(firstLine('\n  rename greet  \nmore')).toBe('rename greet')
  expect(lineOf('one\ntwo\nthree', 'three')).toBe(3)
  expect(lineOf('one', 'missing')).toBe(null)
})

test('stepsFor: Edit, MultiEdit and Write', () => {
  const before = 'const a = 1\nfunction greet() {}\n'
  const [edit] = stepsFor({ tool: 'Edit', file_path: 'C:\\w\\src\\a.ts', old_string: 'function greet() {}', new_string: 'function welcome() {}' }, before, 'C:\\w', 5, 't1.0')
  expect(edit).toMatchObject({ id: 't1.0.0', path: 'C:/w/src/a.ts', rel: 'src/a.ts', tool: 'Edit', status: 'pending', line: 2, add: 1, del: 1, at: 5 })

  const multi = stepsFor({ tool: 'MultiEdit', file_path: '/w/a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] }, 'a\nc\n', '/w', 1, 't1.1')
  expect(multi.map(s => s.note)).toEqual(['edit 1 of 2', 'edit 2 of 2'])
  expect(multi.map(s => s.line)).toEqual([1, 2])

  const [fresh] = stepsFor({ tool: 'Write', file_path: '/w/new.md', content: 'x\ny\n' }, null, '/w', 1, 't1.2')
  expect(fresh).toMatchObject({ note: 'new file', add: 2, del: 0, line: null })
  const [rewrite] = stepsFor({ tool: 'Write', file_path: '/w/old.md', content: 'x\n' }, 'x\ny\n', '/w', 1, 't1.3')
  expect(rewrite).toMatchObject({ note: 'rewrite', add: 0, del: 1 })

  expect(stepsFor({ tool: 'Read', file_path: '/w/a.ts' }, null, '/w', 1, 't')).toEqual([])
})

test('stepsFor skips files outside the project, but keeps everything when no root is known', () => {
  const temp = { tool: 'Write', file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\msg.txt', content: 'x\n' }
  expect(stepsFor(temp, null, 'C:\\work\\demo', 1, 't')).toEqual([])
  expect(stepsFor({ ...temp, file_path: 'C:\\work\\demo-other\\a.ts' }, null, 'C:\\work\\demo', 1, 't')).toEqual([])
  expect(stepsFor({ ...temp, file_path: 'c:\\WORK\\demo\\a.ts' }, null, 'C:\\work\\demo', 1, 't').length).toBe(1)
  expect(stepsFor(temp, null, '', 1, 't').length).toBe(1)
})

test('a huge Write keeps 200 diff lines but counts them all', () => {
  const content = Array.from({ length: 300 }, (_, k) => `line ${k}`).join('\n')
  const [s] = stepsFor({ tool: 'Write', file_path: '/w/big.txt', content }, null, '/w', 1, 't')
  expect(s!.add).toBe(300)
  expect(s!.diff.length).toBe(201)
  expect(s!.diff[200]).toEqual({ op: '~', t: '… 100 more lines' })
})

test('outcomeOf reads deny and isError', () => {
  expect(outcomeOf({ deny: 'no' })).toBe('denied')
  expect(outcomeOf({ result: 'x', isError: true })).toBe('failed')
  expect(outcomeOf({ result: 'x' })).toBe('ok')
})

const turn = (id: string, size = 0): Turn => ({ id, at: 0, prompt: 'x'.repeat(size), steps: [] })

test('addTurn keeps the newest turns and replaces a turn with the same id', () => {
  let turns: Turn[] = []
  for (let k = 0; k < 55; k++) turns = addTurn(turns, turn(`t${k}`))
  expect(turns.length).toBe(50)
  expect(turns[0]!.id).toBe('t5')
  expect(addTurn(turns, turn('t54')).length).toBe(50)
})

test('planBudget evicts the least recently used other projects first', () => {
  const index = { 'p:a': { used: 3, bytes: 40 }, 'p:b': { used: 1, bytes: 40 }, 'p:c': { used: 2, bytes: 40 } }
  expect(planBudget(index, 'p:a', 70, 100)).toEqual({ evict: ['p:b', 'p:c'], fits: true })
  expect(planBudget(index, 'p:a', 50, 100)).toEqual({ evict: ['p:b'], fits: true })
  expect(planBudget(index, 'p:a', 10, 100)).toEqual({ evict: [], fits: true })
  expect(planBudget({}, 'p:a', 150, 100)).toEqual({ evict: [], fits: false })
})

test('trimTurnsToBytes drops the oldest turns until it fits', () => {
  const turns = [turn('old', 100), turn('mid', 100), turn('new', 100)]
  const kept = trimTurnsToBytes(turns, byteSize(turns.slice(1)))
  expect(kept.map(t => t.id)).toEqual(['mid', 'new'])
})
