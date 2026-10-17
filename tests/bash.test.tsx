import { expect, test } from 'claude-code/testing'

import { isCommit, readTargets, splitCommands, tokenize, toPath } from '../hooks/bash'
import { PANE, START, hasText, rowText, world, pressRow } from './world'

const ROOT = 'C:\\work\\demo'
const paths = (command: string) => readTargets(command, ROOT).map(t => [t.path, t.follow])

test('splitCommands splits at && || ; | and newlines outside quotes', () => {
  expect(splitCommands('cat a.ts && rg "x|y" src; ls\nwc -l b.ts | head')).toEqual(['cat a.ts', 'rg "x|y" src', 'ls', 'wc -l b.ts', 'head'])
})

test('tokenize drops quotes and refuses words built at run time', () => {
  expect(tokenize(`cat "my file.md" 'it''s'`)).toEqual(['cat', 'my file.md', 'its'])
  expect(tokenize('cat $FILE')).toBe(null)
  expect(tokenize('cat "$(pwd)/a"')).toBe(null)
  expect(tokenize('cat `ls`')).toBe(null)
})

test('toPath: relative under the root, Git Bash drive paths, globs and ~ skipped', () => {
  expect(toPath(ROOT, './src/a.ts')).toBe('C:/work/demo/src/a.ts')
  expect(toPath(ROOT, '/c/work/demo/README.md')).toBe('C:/work/demo/README.md')
  expect(toPath(ROOT, 'C:\\work\\demo\\x.md')).toBe('C:/work/demo/x.md')
  expect(toPath(ROOT, 'src/*.ts')).toBe(null)
  expect(toPath(ROOT, '~/notes.md')).toBe(null)
})

test('readers name files to follow; searchers and listings name paths to light', () => {
  expect(paths('cat src/a.ts README.md')).toEqual([['C:/work/demo/src/a.ts', true], ['C:/work/demo/README.md', true]])
  expect(paths('head -n 20 src/a.ts')).toEqual([['C:/work/demo/src/a.ts', true]])
  expect(paths('rg -n "greet" src docs')).toEqual([['C:/work/demo/src', false], ['C:/work/demo/docs', false]])
  expect(paths('grep -e greet -r src')).toEqual([['C:/work/demo/src', false]])
  expect(paths('find src -name "*.ts"')).toEqual([['C:/work/demo/src', false]])
  expect(paths('ls -la docs')).toEqual([['C:/work/demo/docs', false]])
  expect(paths('Get-Content -Path "src\\a.ts" -TotalCount 5')).toEqual([['C:/work/demo/src/a.ts', true]])
  expect(paths('FOO=1 cat src/a.ts')).toEqual([['C:/work/demo/src/a.ts', true]])
})

test('anything unclear is skipped rather than lit in the wrong place', () => {
  expect(paths('cd sub && cat a.ts')).toEqual([])
  expect(paths('cat a.ts && cd sub && cat b.ts')).toEqual([['C:/work/demo/a.ts', true]])
  expect(paths('cat "$HOME/a.ts"')).toEqual([])
  expect(paths('npm test')).toEqual([])
  expect(paths('echo hi > out.txt')).toEqual([])
  expect(paths('rg greet')).toEqual([])
})

test('isCommit finds git commit, git flags before it allowed', () => {
  expect(isCommit('git add -A && git commit -m "x"')).toBe(true)
  expect(isCommit('git -C repo commit -m x')).toBe(true)
  expect(isCommit('git status')).toBe(false)
  expect(isCommit('echo "git commit"')).toBe(false)
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['a.ts', 'file'], ['b.ts', 'file']],
}
const FILES = { 'C:\\work\\demo\\src\\a.ts': 'a\n', 'C:\\work\\demo\\src': '', 'C:\\work\\demo\\README.md': '#\n' }
const rowKey = (path: string) => `row-${path.toLowerCase()}`

test('a Bash read lights the file and opens the tree to it; a search lights its folder', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Bash', command: 'cat src/a.ts && rg greet README.md' } as never)
  await clock.advance(200)
  expect(await rowText(ui, rowKey('C:/work/demo/src/a.ts'))).toMatch(/a\.ts · reading$/)
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toMatch(/README\.md · reading$/)
  // A path that is not there lights nothing.
  await $.tool.call({ tool: 'Bash', command: 'cat src/missing.ts' } as never)
  expect(await hasText(ui, 'missing.ts')).toBe(false)
  await ui.unmount()
})

test('after git commit goes through, its files light green; a failed commit lights nothing', async ($, on) => {
  const git = { top: 'C:/work/demo', status: '## main\0', numstat: '', show: 'src/b.ts\nREADME.md\n' }
  const { clock, ran } = world(on, { dirs: DIRS, files: FILES, git })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/src'))

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x" --fail' } as never)
  expect(ran.some(a => a[1] === 'show')).toBe(false)

  await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m "rename"' } as never)
  expect(await rowText(ui, rowKey('C:/work/demo/src/b.ts'))).toMatch(/b\.ts · committed$/)
  expect(await rowText(ui, rowKey('C:/work/demo/README.md'))).toMatch(/README\.md · committed$/)
  await ui.unmount()
})
