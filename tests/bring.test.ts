// Bringing History from another folder: which folders are offered, and how turns move
// between two folders' keys. Pure functions, no engine.

import { expect, test } from './kit'

import type { Turn } from '../types'
import {
  bringCandidates, keepSplit, linkKey, mainOf, MAX_BLOCKED_ONLY, MAX_TURNS, mergeTurns, planBudget, projectKey, relHere,
  stepsFor, unbringSplit,
} from '../hooks/history'

const turn = (id: string, at: number, over: Partial<Turn> = {}): Turn => ({
  id, at, prompt: id,
  steps: [{ id: `${id}.0.0`, path: 'C:/work/demo/a.ts', rel: 'a.ts', tool: 'Edit', note: '', line: 1, at, status: 'ok', add: 1, del: 1, diff: [] }],
  ...over,
})
const blockedOnly = (id: string, at: number): Turn => ({ id, at, prompt: id, steps: [], blocked: [{ id: `${id}.b`, tool: 'Bash', call: 'x', reason: 'no', kind: 'hook', at }] })

test('mainOf is the repo folder: the common dir without .git, else a worktree path cut at .claude/worktrees', () => {
  expect(mainOf('ignored', 'C:/work/demo/.git')).toBe('c:/work/demo')
  expect(mainOf('ignored', 'C:/work/demo/.git/')).toBe('c:/work/demo')
  expect(mainOf('C:\\work\\demo\\.claude\\worktrees\\brave-x1\\src')).toBe('c:/work/demo')
  expect(mainOf('c:/work/other')).toBe('c:/work/other')
})

test('bringCandidates puts this repo first (written repo, or guessed from the path), then the rest by last use', () => {
  const here = 'C:/work/demo/.claude/worktrees/new-one'
  const index = {
    [projectKey(here)]: { used: 99, bytes: 10 },
    'p:c:/elsewhere': { used: 80, bytes: 1 },
    // Written by this version: its repo says it is the same repo, though the path does not.
    'p:d:/clones/demo-copy': { used: 10, bytes: 5, repo: 'C:/work/demo/.git', root: 'D:/clones/Demo-Copy' },
    // Older entries without repo: guessed from their path.
    'p:c:/work/demo/.claude/worktrees/old-one': { used: 40, bytes: 512 },
    'p:c:/work/demo': { used: 30, bytes: 2048 },
    'p:c:/work/demo/src': { used: 20, bytes: 3 },
    // Shown as brought by another folder right now: not offered.
    'p:c:/work/demo/.claude/worktrees/held': { used: 70, bytes: 4, heldBy: 'p:c:/x' },
    index: { used: 1, bytes: 1 },
  }
  const list = bringCandidates(index as any, projectKey(here), { root: here, repo: 'C:/work/demo/.git' })
  expect(list.map(e => e.key)).toEqual([
    'p:c:/work/demo/.claude/worktrees/old-one', 'p:c:/work/demo', 'p:c:/work/demo/src', 'p:d:/clones/demo-copy', 'p:c:/elsewhere',
  ])
  expect(list.map(e => e.same)).toEqual([true, true, true, true, false])
  // The folder as spelled when it was written; an older entry has only its key's case-folded path.
  expect(list.find(e => e.key === 'p:d:/clones/demo-copy')!.root).toBe('D:/clones/Demo-Copy')
  expect(list.find(e => e.key === 'p:c:/work/demo')!.root).toBe('c:/work/demo')
})

test('bringCandidates outside git guesses the repo from the worktree path shape alone', () => {
  const list = bringCandidates({ 'p:c:/work/demo': { used: 1, bytes: 1 }, 'p:c:/other': { used: 2, bytes: 1 } }, 'p:c:/work/demo/.claude/worktrees/w', { root: 'C:/work/demo/.claude/worktrees/w' })
  expect(list.map(e => e.key)).toEqual(['p:c:/work/demo', 'p:c:/other'])
})

test('linkKey sits beside the folder key, outside the p: keys the budget evicts', () => {
  expect(linkKey('p:c:/work/demo')).toBe('b:c:/work/demo')
})

test('planBudget drops a held folder only after every other one', () => {
  const index = {
    'p:held': { used: 1, bytes: 100, heldBy: 'p:me' },
    'p:old': { used: 2, bytes: 100 },
    'p:new': { used: 3, bytes: 100 },
  }
  expect(planBudget(index, 'p:me', 100, 350)).toEqual({ evict: ['p:old'], fits: true })
  expect(planBudget(index, 'p:me', 100, 150)).toEqual({ evict: ['p:old', 'p:new', 'p:held'], fits: true })
})

test('mergeTurns orders two folders by time and keeps addTurn\'s budget, an id in both once', () => {
  const a = [turn('a1', 1), turn('a3', 3)]
  const b = [turn('b2', 2), turn('a3', 4)]
  expect(mergeTurns(a, b).map(t => `${t.id}@${t.at}`)).toEqual(['a1@1', 'b2@2', 'a3@4'])
  const many = Array.from({ length: MAX_TURNS + 5 }, (_, k) => turn(`m${k}`, k))
  const blocked = Array.from({ length: MAX_BLOCKED_ONLY + 2 }, (_, k) => blockedOnly(`x${k}`, 100 + k))
  const merged = mergeTurns(many, blocked)
  expect(merged.filter(t => t.steps.length).length).toBe(MAX_TURNS)
  expect(merged.filter(t => !t.steps.length).length).toBe(MAX_BLOCKED_ONLY)
  expect(merged[0]!.id).toBe('m5')
})

test('keepSplit marks the origin\'s turns with from and leaves what does not fit with the origin, unmarked', () => {
  const own = Array.from({ length: 10 }, (_, k) => turn(`o${k}`, 1000 + k))
  const origin = Array.from({ length: 45 }, (_, k) => turn(`g${k}`, k))
  const { kept, left } = keepSplit(own, origin, 'C:/work/demo')
  expect(kept).toHaveLength(MAX_TURNS)
  expect(kept.filter(t => t.from === 'C:/work/demo')).toHaveLength(40)
  expect(kept.filter(t => !t.from).map(t => t.id)).toEqual(own.map(t => t.id))
  expect(left.map(t => t.id)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4'])
  expect(left.every(t => t.from === undefined)).toBe(true)
  expect(keepSplit([], origin.slice(0, 3), 'C:/w').left).toEqual([])
})

test('unbringSplit takes back the turns from one folder, any spelling, without their mark', () => {
  const own = [turn('o1', 1), turn('g1', 2, { from: 'C:/work/demo' }), turn('h1', 3, { from: 'C:/work/other' })]
  const { stay, back } = unbringSplit(own, 'c:\\work\\demo\\')
  expect(stay.map(t => t.id)).toEqual(['o1', 'h1'])
  expect(back.map(t => t.id)).toEqual(['g1'])
  expect('from' in back[0]!).toBe(false)
})

test('an edit above the session folder is recorded when it is inside the repo, named from the repo top', () => {
  const call = { tool: 'Edit', file_path: 'C:\\work\\demo\\tools\\x.ts', old_string: 'a', new_string: 'b' }
  expect(stepsFor(call, 'a\n', 'C:/work/demo/src', 1, 't1.0')).toEqual([])
  const steps = stepsFor(call, 'a\n', 'C:/work/demo/src', 1, 't1.0', 'C:/work/demo')
  expect(steps.map(s => s.rel)).toEqual(['tools/x.ts'])
  // Inside the session folder a path still reads from there; outside the repo nothing is recorded.
  expect(relHere('C:/work/demo/src', 'C:/work/demo', 'C:/work/demo/src/b.ts')).toBe('b.ts')
  expect(stepsFor({ ...call, file_path: 'C:\\elsewhere\\x.ts' }, 'a\n', 'C:/work/demo/src', 1, 't1.0', 'C:/work/demo')).toEqual([])
})
