import { expect, test } from 'claude-code/testing'

import type { GitInfo, Turn } from '../types'
import { codeOf, dirStatus, fileStatus, lineCounts, parseBranch, parseNumstat, parseStatus } from '../hooks/git'
import { editCounts, hasEditsBelow, parentOf, toEntries, visibleRows } from '../hooks/tree'

const L = (name: string, kind: 'file' | 'dir' = 'file') => ({ name, kind, isLink: false })

test('toEntries: folders first, by name ignoring case, .git left out', () => {
  const { entries, more } = toEntries('C:\\w', [L('b.ts'), L('.git', 'dir'), L('Src', 'dir'), L('a.ts'), L('docs', 'dir')])
  expect(entries.map(e => e.name)).toEqual(['docs', 'Src', 'a.ts', 'b.ts'])
  expect(entries[1]).toEqual({ name: 'Src', path: 'C:/w/Src', kind: 'dir' })
  expect(more).toBe(0)
  expect(parentOf('C:/w/Src/a.ts')).toBe('C:/w/Src')
})

test('visibleRows walks open folders only, matching paths without case', () => {
  const listing = {
    'c:/w': toEntries('C:/w', [L('src', 'dir'), L('lib', 'dir'), L('README.md')]).entries,
    'c:/w/src': toEntries('C:/w/src', [L('a.ts')]).entries,
    'c:/w/lib': toEntries('C:/w/lib', [L('x.ts')]).entries,
  }
  const rows = visibleRows('C:\\W', listing, ['c:/w/src'])
  expect(rows.map(r => [r.entry.name, r.depth, r.isOpen])).toEqual([
    ['lib', 0, false], ['src', 0, true], ['a.ts', 1, false], ['README.md', 0, false],
  ])
})

test('editCounts counts applied edits only; hasEditsBelow sees nested files', () => {
  const step = (path: string, status: 'ok' | 'denied') => ({ id: '', path, rel: '', tool: 'Edit', note: '', status, line: null, add: 0, del: 0, diff: [], at: 0 })
  const turns: Turn[] = [{ id: 't', at: 0, prompt: '', steps: [step('C:/w/src/a.ts', 'ok'), step('c:/W/src/A.ts', 'ok'), step('C:/w/b.ts', 'denied')] }]
  const counts = editCounts(turns)
  expect(counts.get('c:/w/src/a.ts')).toBe(2)
  expect(counts.has('c:/w/b.ts')).toBe(false)
  expect(hasEditsBelow(counts, 'C:/w/src')).toBe(true)
  expect(hasEditsBelow(counts, 'C:/w/lib')).toBe(false)
})

test('codeOf and parseBranch', () => {
  expect(['??', ' M', 'M ', 'MM', 'A ', ' D', 'R ', 'UU', 'AA', ' T'].map(codeOf)).toEqual(['?', 'M', 'M', 'M', 'A', 'D', 'R', 'U', 'U', 'M'])
  expect(parseBranch('## main...origin/main [ahead 2, behind 1]')).toEqual({ head: 'main', upstream: 'origin/main', ahead: 2, behind: 1 })
  expect(parseBranch('## feat/x')).toEqual({ head: 'feat/x', upstream: '', ahead: 0, behind: 0 })
  expect(parseBranch('## No commits yet on main')).toEqual({ head: 'main', upstream: '', ahead: 0, behind: 0 })
  expect(parseBranch('## HEAD (no branch)')?.head).toBe('HEAD')
})

test('parseStatus reads -z records, skipping a rename source', () => {
  const out = '## main\0 M src/a.ts\0R  src/new.ts\0src/old.ts\0?? tmp/\0?? notes.md\0'
  expect(parseStatus(out)).toEqual({
    branch: { head: 'main', upstream: '', ahead: 0, behind: 0 },
    status: { 'src/a.ts': 'M', 'src/new.ts': 'R', 'notes.md': '?' },
    untrackedDirs: ['tmp/'],
  })
})

test('parseNumstat handles binary and both rename spellings', () => {
  expect(parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png\n2\t0\tsrc/{old => new}/b.ts\n1\t1\tx.ts => y.ts\n')).toEqual({
    'src/a.ts': [3, 1], 'img.png': [0, 0], 'src/new/b.ts': [2, 0], 'y.ts': [1, 1],
  })
})

test('fileStatus, dirStatus and lineCounts against the repo top', () => {
  const git: GitInfo = {
    top: 'C:/w', branch: null, untrackedDirs: ['tmp/'],
    status: { 'src/a.ts': 'M', 'docs/n.md': '?' }, numstat: { 'src/a.ts': [3, 1] },
  }
  expect(fileStatus(git, 'C:\\w\\src\\a.ts')).toBe('M')
  expect(fileStatus(git, 'C:/w/tmp/deep/x.txt')).toBe('?')
  expect(fileStatus(git, 'C:/w/clean.ts')).toBe('')
  expect(fileStatus(git, 'D:/elsewhere/a.ts')).toBe('')
  expect(fileStatus(null, 'C:/w/src/a.ts')).toBe('')
  expect(dirStatus(git, 'C:/w/src')).toBe('M')
  expect(dirStatus(git, 'C:/w/docs')).toBe('?')
  expect(dirStatus(git, 'C:/w/tmp')).toBe('?')
  expect(dirStatus(git, 'C:/w/lib')).toBe('')
  expect(lineCounts(git, 'C:/w/src/a.ts')).toEqual([3, 1])
  expect(lineCounts(git, 'C:/w/clean.ts')).toBe(null)
})
