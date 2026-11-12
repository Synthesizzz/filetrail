import { expect, test } from './kit'

import { addOutside, isOutside, OUTSIDE_MAX } from '../hooks/outside'

const BASE = 'C:/work/demo'
const HOME = 'C:/Users/ana'

test('a path under the project is not outside, whatever the slashes or case; a relative one resolves inside', () => {
  expect(isOutside(BASE, HOME, 'C:/work/demo/src/a.ts')).toBe(false)
  expect(isOutside(BASE, HOME, 'C:\\Work\\Demo\\SRC\\a.ts')).toBe(false)
  expect(isOutside(BASE, HOME, 'src/a.ts')).toBe(false)
  expect(isOutside(BASE, HOME, './src/a.ts')).toBe(false)
})

test('a path elsewhere is outside, a sibling folder that only starts with the same letters too', () => {
  expect(isOutside(BASE, HOME, 'C:/work/other/x.ts')).toBe(true)
  expect(isOutside(BASE, HOME, 'C:/work/demo2/x.ts')).toBe(true)
  expect(isOutside(BASE, HOME, 'C:/Users/ana/notes.md')).toBe(true)
  expect(isOutside(BASE, HOME, '../other/x.ts')).toBe(true)
  expect(isOutside(BASE, HOME, 'src/../../x.ts')).toBe(true)
})

test("Claude's own config folder and the temp folders are where work legitimately goes, so they are not outside", () => {
  expect(isOutside(BASE, HOME, 'C:/Users/ana/.claude/settings.json')).toBe(false)
  expect(isOutside(BASE, HOME, 'C:/Users/ana/.claude/projects/x/memory/m.md')).toBe(false)
  expect(isOutside(BASE, HOME, 'C:/Users/ana/AppData/Local/Temp/claude/x/scratch.txt')).toBe(false)
  expect(isOutside(BASE, HOME, '/tmp/x.txt')).toBe(false)
  expect(isOutside(BASE, HOME, '/var/tmp/x.txt')).toBe(false)
  expect(isOutside(BASE, HOME, '/var/folders/ab/cd/T/x.txt')).toBe(false)
  expect(isOutside(BASE, HOME, '/private/tmp/x.txt')).toBe(false)
  expect(isOutside(BASE, HOME, 'C:/Windows/Temp/x.txt')).toBe(false)
  // Only the folder itself: a name that merely starts like it is a different folder.
  expect(isOutside(BASE, HOME, 'C:/Users/ana/.claudex/x.md')).toBe(true)
  expect(isOutside(BASE, HOME, '/tmpfiles/x.txt')).toBe(true)
})

test('with no project folder known nothing is outside', () => {
  expect(isOutside('', HOME, 'C:/anywhere/x.ts')).toBe(false)
})

test('the list keeps each file once, newest first, case aside, and stops at its cap', () => {
  expect(addOutside([], 'C:\\work\\other\\x.ts')).toEqual(['C:/work/other/x.ts'])
  expect(addOutside(['C:/work/other/x.ts', 'C:/work/other/y.ts'], 'C:/WORK/other/Y.ts')).toEqual(['C:/WORK/other/Y.ts', 'C:/work/other/x.ts'])
  const full = Array.from({ length: OUTSIDE_MAX }, (_, i) => `C:/work/other/f${i}.ts`)
  const next = addOutside(full, 'C:/work/other/new.ts')
  expect(next).toHaveLength(OUTSIDE_MAX)
  expect(next[0]).toBe('C:/work/other/new.ts')
  expect(next).not.toContain(`C:/work/other/f${OUTSIDE_MAX - 1}.ts`)
})
