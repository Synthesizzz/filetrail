import { expect, test } from './kit'

import { grepArgv, groupMatches, MAX_MATCHES, MIN_QUERY, parseGrep, summaryLine } from '../hooks/grep'

test('in a repo the query goes to git grep as one argument after -e, fixed and case-insensitive, never through a shell', () => {
  const argv = grepArgv('guard$(rm -rf /)', true)
  expect(argv.slice(0, 2)).toEqual(['git', 'grep'])
  expect(argv).toContain('-F')
  expect(argv).toContain('-i')
  expect(argv).toContain('-I')
  expect(argv).toContain('-n')
  expect(argv).toContain('--untracked')
  expect(argv).toContain('--exclude-standard')
  expect(argv.at(-2)).toBe('-e')
  expect(argv.at(-1)).toBe('guard$(rm -rf /)')
})

test('a query that starts with a dash is still the pattern, not an option', () => {
  const argv = grepArgv('--no-index', true)
  expect(argv.at(-2)).toBe('-e')
  expect(argv.at(-1)).toBe('--no-index')
  const plain = grepArgv('-v', false)
  expect(plain.at(-3)).toBe('-e')
  expect(plain.at(-2)).toBe('-v')
})

test('outside a repo it is a recursive grep over the folder, leaving out .git and node_modules', () => {
  const argv = grepArgv('todo', false)
  expect(argv[0]).toBe('grep')
  expect(argv).toContain('-r')
  expect(argv).toContain('-F')
  expect(argv).toContain('--exclude-dir=.git')
  expect(argv).toContain('--exclude-dir=node_modules')
  expect(argv.at(-1)).toBe('.')
})

test('git grep -z output is read as path, line, text; slashes forward, indentation dropped', () => {
  const out = 'src/a.ts\x0012\x00  const guard = 1\nsrc/a.ts\x0020\x00guard()\nREADME.md\x003\x00# Guard\n'
  expect(parseGrep(out, true)).toEqual({
    matches: [
      { path: 'src/a.ts', line: 12, text: 'const guard = 1' },
      { path: 'src/a.ts', line: 20, text: 'guard()' },
      { path: 'README.md', line: 3, text: '# Guard' },
    ],
    total: 3,
    capped: false,
  })
})

test('grep --null output is read the same way, with the ./ it prefixes dropped, and a path with a colon survives', () => {
  const out = './src/a.ts\x0012:const guard = 1\r\n./we:ird.txt\x007:guard\n'
  expect(parseGrep(out, false).matches).toEqual([
    { path: 'src/a.ts', line: 12, text: 'const guard = 1' },
    { path: 'we:ird.txt', line: 7, text: 'guard' },
  ])
})

test('a line that is not a match record (a notice, a blank) is skipped', () => {
  expect(parseGrep('\nBinary file x matches\nsrc/a.ts\x001\x00hit\n', true).matches).toEqual([{ path: 'src/a.ts', line: 1, text: 'hit' }])
  expect(parseGrep('', true)).toEqual({ matches: [], total: 0, capped: false })
})

test(`only the first ${MAX_MATCHES} matches are kept; the total and the cap say there were more`, () => {
  const out = Array.from({ length: MAX_MATCHES + 30 }, (_, i) => `f${i % 7}.ts\x00${i + 1}\x00hit ${i}`).join('\n') + '\n'
  const r = parseGrep(out, true)
  expect(r.matches).toHaveLength(MAX_MATCHES)
  expect(r.total).toBe(MAX_MATCHES + 30)
  expect(r.capped).toBe(true)
})

test('a long line is cut so one match cannot fill the pane', () => {
  const r = parseGrep(`min.js\x001\x00${'x'.repeat(5000)}\n`, true)
  expect(r.matches[0]!.text.length).toBeLessThanOrEqual(201)
  expect(r.matches[0]!.text.endsWith('…')).toBe(true)
})

test('matches group per file, in the order the files first appear', () => {
  const groups = groupMatches([
    { path: 'b.ts', line: 1, text: 'x' }, { path: 'a.ts', line: 4, text: 'y' }, { path: 'b.ts', line: 9, text: 'z' },
  ])
  expect(groups.map(g => [g.path, g.items.map(i => i.line)])).toEqual([['b.ts', [1, 9]], ['a.ts', [4]]])
})

test('the summary line says how many matches in how many files, and when it was cut', () => {
  expect(summaryLine({ matches: [], total: 0, capped: false })).toBe('No matches.')
  expect(summaryLine({ matches: [{ path: 'a.ts', line: 1, text: 'x' }], total: 1, capped: false })).toBe('1 match in 1 file')
  expect(summaryLine({ matches: [{ path: 'a.ts', line: 1, text: 'x' }, { path: 'b.ts', line: 1, text: 'x' }], total: 2, capped: false })).toBe('2 matches in 2 files')
  const cut = { matches: Array.from({ length: MAX_MATCHES }, (_, i) => ({ path: `f${i % 3}.ts`, line: i + 1, text: 'x' })), total: 500, capped: true }
  expect(summaryLine(cut)).toBe(`500 matches, the first ${MAX_MATCHES} shown in 3 files`)
})

test('a query needs at least two characters', () => {
  expect(MIN_QUERY).toBe(2)
})
