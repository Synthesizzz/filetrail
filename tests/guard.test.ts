import { expect, test } from 'claude-code/testing'

import { coveredBy, guardReason, mentionedGuard, toggled, writtenPath } from '../hooks/guard'

const ROOT = 'C:/work/demo'
const HOME = 'C:/Users/ana'

test('a guard covers its own path and everything beneath it, whatever the slashes, case or trailing slash', () => {
  const guards = ['C:/work/demo/src', 'C:/work/demo/.env']
  expect(coveredBy(guards, 'C:/work/demo/src')).toBe('C:/work/demo/src')
  expect(coveredBy(guards, 'C:\\Work\\Demo\\SRC\\a\\b.ts')).toBe('C:/work/demo/src')
  expect(coveredBy(['C:/work/demo/src/'], 'C:/work/demo/src/a.ts')).toBe('C:/work/demo/src/')
  expect(coveredBy(guards, 'C:/work/demo/.env')).toBe('C:/work/demo/.env')
})

test('a guard does not cover a sibling that only starts with the same letters, nor its own folder', () => {
  const guards = ['C:/work/demo/src']
  expect(coveredBy(guards, 'C:/work/demo/src2/a.ts')).toBeUndefined()
  expect(coveredBy(guards, 'C:/work/demo/src.bak')).toBeUndefined()
  expect(coveredBy(guards, 'C:/work/demo')).toBeUndefined()
  expect(coveredBy([], 'C:/work/demo/src')).toBeUndefined()
})

test('toggled adds a path, removes the same one, and drops guards a new folder guard already holds', () => {
  expect(toggled(['C:/work/demo/a.ts'], 'C:/work/demo/b.ts')).toEqual(['C:/work/demo/a.ts', 'C:/work/demo/b.ts'])
  expect(toggled(['C:/work/demo/a.ts', 'C:/work/demo/b.ts'], 'C:\\work\\demo\\A.ts')).toEqual(['C:/work/demo/b.ts'])
  expect(toggled(['C:/work/demo/src/a.ts', 'C:/work/demo/x'], 'C:/work/demo/src')).toEqual(['C:/work/demo/x', 'C:/work/demo/src'])
})

test('writtenPath is the file an Edit, Write, MultiEdit or NotebookEdit changes, and nothing for any other call', () => {
  expect(writtenPath({ tool: 'Edit', file_path: 'C:\\work\\demo\\a.ts' })).toBe('C:/work/demo/a.ts')
  expect(writtenPath({ tool: 'Write', file_path: 'C:/work/demo/a.ts' })).toBe('C:/work/demo/a.ts')
  expect(writtenPath({ tool: 'MultiEdit', file_path: 'C:/work/demo/a.ts' })).toBe('C:/work/demo/a.ts')
  expect(writtenPath({ tool: 'NotebookEdit', notebook_path: 'C:/work/demo/n.ipynb' })).toBe('C:/work/demo/n.ipynb')
  expect(writtenPath({ tool: 'Read', file_path: 'C:/work/demo/a.ts' })).toBeNull()
  expect(writtenPath({ tool: 'Bash', command: 'echo hi > a.ts' })).toBeNull()
  expect(writtenPath({ tool: 'Edit' })).toBeNull()
})

test('a command names a guard by its full path, its path from the folder it runs in, ./ or ~', () => {
  const file = ['C:/work/demo/src/a.ts']
  expect(mentionedGuard('sed -i s/a/b/ C:/work/demo/src/a.ts', file, ROOT, HOME)).toBe(file[0])
  expect(mentionedGuard('sed -i s/a/b/ src/a.ts', file, ROOT, HOME)).toBe(file[0])
  expect(mentionedGuard('rm ./src/a.ts', file, ROOT, HOME)).toBe(file[0])
  expect(mentionedGuard('echo x > "C:\\work\\demo\\src\\a.ts"', file, ROOT, HOME)).toBe(file[0])
  expect(mentionedGuard('cat /c/work/demo/src/a.ts', file, ROOT, HOME)).toBe(file[0])
  expect(mentionedGuard('cat ~/notes/todo.md', ['C:/Users/ana/notes/todo.md'], ROOT, HOME)).toBe('C:/Users/ana/notes/todo.md')
})

test('a command that names something inside a guarded folder is caught, one that only shares letters is not', () => {
  const folder = ['C:/work/demo/src']
  expect(mentionedGuard('rm src/a/b.ts', folder, ROOT, HOME)).toBe(folder[0])
  expect(mentionedGuard('rm -rf src', folder, ROOT, HOME)).toBe(folder[0])
  expect(mentionedGuard('rm src.bak', folder, ROOT, HOME)).toBeUndefined()
  expect(mentionedGuard('rm src-old/a.ts', folder, ROOT, HOME)).toBeUndefined()
  expect(mentionedGuard('rm mysrc', folder, ROOT, HOME)).toBeUndefined()
  expect(mentionedGuard('ls -la', folder, ROOT, HOME)).toBeUndefined()
  expect(mentionedGuard('rm src/a.ts', [], ROOT, HOME)).toBeUndefined()
})

test('the reason names the guard and says how to lift it', () => {
  const reason = guardReason('C:/work/demo/src')
  expect(reason).toContain('C:/work/demo/src')
  expect(reason).toMatch(/guard/i)
  expect(reason).toMatch(/filetrail/i)
})
