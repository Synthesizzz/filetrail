import { expect, test } from './kit'

import { elsewhereOf, projectKey } from '../hooks/history'
import { ELSEWHERE_SHOWN, elsewhereText } from '../hooks/history-view'

const NOW = new Date(2026, 10, 11, 15, 0).getTime()

test('elsewhereOf lists the other folders, newest use first, and leaves out this one and non-history keys', () => {
  const here = projectKey('C:/work/demo/.claude/worktrees/new-one')
  const index = {
    [here]: { used: 50, bytes: 10 },
    'p:c:/work/demo': { used: 30, bytes: 2048 },
    'p:c:/work/demo/.claude/worktrees/old-one': { used: 40, bytes: 512 },
    other: { used: 99, bytes: 1 },
  }
  expect(elsewhereOf(index, here)).toEqual([
    { path: 'c:/work/demo/.claude/worktrees/old-one', used: 40, bytes: 512 },
    { path: 'c:/work/demo', used: 30, bytes: 2048 },
  ])
})

test('elsewhereText says nothing when no other folder has history', () => {
  expect(elsewhereText([], NOW)).toEqual([])
})

test('elsewhereText names a few folders by their last part and counts the rest', () => {
  const list = Array.from({ length: ELSEWHERE_SHOWN + 2 }, (_, i) => ({ path: `c:/work/f${i}`, used: NOW - i * 60_000, bytes: 1024 }))
  const lines = elsewhereText(list, NOW)
  expect(lines[0]).toBe(`History is kept per folder. ${ELSEWHERE_SHOWN + 2} other folders have some:`)
  expect(lines[1]!.startsWith('· f0  15:00  ')).toBe(true)
  expect(lines[1]!.endsWith('c:/work/f0')).toBe(true)
  expect(lines).toHaveLength(1 + ELSEWHERE_SHOWN + 1)
  expect(lines.at(-1)).toBe('and 2 more')
})

test('elsewhereText says "has" for one folder', () => {
  expect(elsewhereText([{ path: 'c:/work/demo', used: NOW, bytes: 1 }], NOW)[0]).toBe('History is kept per folder. 1 other folder has some:')
})
