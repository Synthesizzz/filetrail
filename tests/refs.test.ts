import { expect, test } from 'claude-code/testing'

import { findRefs, MAX_REFS, refLabel } from '../hooks/refs'

const one = (text: string) => findRefs(text).map(r => [r.path, r.line, r.end])

test('path:line, path:start-end, path#Lline and path#Lstart-Lend are found', () => {
  expect(one('see hooks/guard.ts:34 and src/a.tsx:12-20')).toEqual([['hooks/guard.ts', 34, undefined], ['src/a.tsx', 12, 20]])
  expect(one('at README.md#L7 and docs/x.md#L3-L9 and y.py#L4-8')).toEqual([['README.md', 7, undefined], ['docs/x.md', 3, 9], ['y.py', 4, 8]])
})

test('a column after the line is accepted and left out', () => {
  expect(one('error in src/a.ts:12:5')).toEqual([['src/a.ts', 12, undefined]])
})

test('backticks, brackets and trailing punctuation around a reference are not part of it', () => {
  expect(one('`hooks/guard.ts:34`, (src/a.ts:1), [x](docs/y.md#L2).')).toEqual([['hooks/guard.ts', 34, undefined], ['src/a.ts', 1, undefined], ['docs/y.md', 2, undefined]])
  expect(one('Fixed in src/a.ts:12.')).toEqual([['src/a.ts', 12, undefined]])
})

test('absolute, home, dotted and Windows paths are kept as written', () => {
  expect(one('/etc/hosts.conf:3 ~/notes/a.md:9 ./b.ts:4 ../c.ts:5')).toEqual([['/etc/hosts.conf', 3, undefined], ['~/notes/a.md', 9, undefined], ['./b.ts', 4, undefined], ['../c.ts', 5, undefined]])
  expect(one('C:\\work\\demo\\a.ts:10 and C:/work/demo/b.ts:11')).toEqual([['C:\\work\\demo\\a.ts', 10, undefined], ['C:/work/demo/b.ts', 11, undefined]])
  expect(one('a name.test.tsx:8 and my-file_v2.config.json:3')).toEqual([['name.test.tsx', 8, undefined], ['my-file_v2.config.json', 3, undefined]])
})

test('a URL, a time, a version and a path with no line are not references', () => {
  expect(findRefs('https://example.com/a/b.ts:12 and http://host:8080/x.js#L3')).toEqual([])
  expect(findRefs('at 12:30:45, version 1.2.3:4, port localhost:3000')).toEqual([])
  expect(findRefs('the file hooks/guard.ts has it')).toEqual([])
  expect(findRefs('src/a.ts:0 is not a line')).toEqual([])
})

test('a range that runs backwards is a single line', () => {
  expect(one('src/a.ts:20-10')).toEqual([['src/a.ts', 20, undefined]])
})

test('the same reference twice is one; different lines of a file are separate', () => {
  expect(one('a/b.ts:1 then a/b.ts:1 then a/b.ts:2')).toEqual([['a/b.ts', 1, undefined], ['a/b.ts', 2, undefined]])
})

test(`at most ${MAX_REFS} references are taken from one reply`, () => {
  const text = Array.from({ length: MAX_REFS + 10 }, (_, i) => `src/f${i}.ts:${i + 1}`).join(' ')
  expect(findRefs(text)).toHaveLength(MAX_REFS)
})

test('a label shows the path with its line or range', () => {
  expect(refLabel({ path: 'src/a.ts', line: 12 })).toBe('src/a.ts:12')
  expect(refLabel({ path: 'src/a.ts', line: 12, end: 20 })).toBe('src/a.ts:12-20')
})
