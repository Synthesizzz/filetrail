import { expect, test } from 'claude-code/testing'

import { deleteTargets } from '../hooks/bash'
import { deleteStep } from '../hooks/history'
import type { Turn } from '../types'
import { DONE, PANE, START, pressRow, rowText, world } from './world'

const ROOT = 'C:\\work\\demo'
const rowKey = (path: string) => `row-${path.toLowerCase()}`
const touchedKey = (path: string) => `touched-${path.toLowerCase()}`
/** Clicks a toolbar icon as its Client does: a post naming the tool. */
const tool = (ui: any, id: string) => ui.post({ tool: id }, { in: 'tree-tools' })

test('deleteTargets reads rm, del, Remove-Item and git rm; keeps out --cached, globs and words built at run time', () => {
  const del = (command: string) => deleteTargets(command, ROOT)
  expect(del('rm -f src/a.ts README.md')).toEqual(['C:/work/demo/src/a.ts', 'C:/work/demo/README.md'])
  expect(del('rm -rf build')).toEqual(['C:/work/demo/build'])
  expect(del('del /q notes.txt')).toEqual(['C:/work/demo/notes.txt'])
  expect(del('Remove-Item -Path "src\\old.ts" -Force')).toEqual(['C:/work/demo/src/old.ts'])
  expect(del('Remove-Item -Recurse -Include *.log dist')).toEqual(['C:/work/demo/dist'])
  expect(del('git rm src/a.ts')).toEqual(['C:/work/demo/src/a.ts'])
  expect(del('git rm --cached src/a.ts')).toEqual([])
  expect(del('rm *.log')).toEqual([])
  expect(del('rm "$TMP/x"')).toEqual([])
  expect(del('cd sub && rm a.ts')).toEqual([])
  expect(del('cat a.ts && echo rm b.ts')).toEqual([])
})

test('deleteStep keeps the text as removed lines and says who deleted it', () => {
  const step = deleteStep('C:/work/demo/a.ts', 'C:/work/demo', 'one\ntwo\n', 'you', 1, 'd1')
  expect(step).toMatchObject({ tool: 'Delete', rel: 'a.ts', note: 'deleted by you', status: 'ok', add: 0, del: 2 })
  expect(step.diff.map(l => l.op + l.t)).toEqual(['-one', '-two'])
  expect(deleteStep('C:/work/demo/a.png', 'C:/work/demo', null, 'claude', 1, 'd2').note).toBe('deleted · no copy kept')
})

/** A small project: two files under src, one at the root. Fresh per test: a test deletes from it. */
function project() {
  const dirs: Record<string, [string, 'file' | 'dir'][]> = {
    'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
    'C:/work/demo/src': [['a.ts', 'file'], ['b.ts', 'file']],
  }
  const files: Record<string, string> = { 'C:\\work\\demo\\src\\a.ts': 'alpha\nbeta\n', 'C:\\work\\demo\\src\\b.ts': 'b\n', 'C:\\work\\demo\\src': '', 'C:\\work\\demo\\README.md': '#\n' }
  /** Deletes a file as the disk would: gone from the fake fs and from its folder's listing. */
  const remove = (dir: string, name: string) => {
    delete files[`${dir.split('/').join('\\')}\\${name}`]
    const kids = dirs[dir] ?? dirs[dir.split('/').join('\\')]!
    kids.splice(kids.findIndex(([n]) => n === name), 1)
  }
  return { dirs, files, remove }
}

const lastTurn = (history: Turn[][]) => history.at(-1)!.at(-1)!

test('a file Claude deletes with rm is kept in its turn, its text as removed lines, and listed once as Deleted', async ($, on) => {
  const { dirs, files, remove } = project()
  const { clock, history } = world(on, {
    dirs, files,
    onBash: command => { if (command === 'rm src/a.ts') remove('C:/work/demo/src', 'a.ts') },
  })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/src'))
  await $.turn.start({ turnId: 't1', text: 'clean up a.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm src/a.ts' } as never)
  await clock.advance(200)
  // The tree drops the row; the card says what happened, and the touched list keeps it.
  expect(await ui.find({ key: rowKey('C:/work/demo/src/a.ts') })).toBeUndefined()
  expect(await rowText(ui, touchedKey('C:/work/demo/src/a.ts'))).toMatch(/a\.ts.*Deleted/)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  const turn = lastTurn(history)
  expect(turn.prompt).toBe('clean up a.ts')
  // One step, though the listing after the turn saw it gone too.
  const deletes = turn.steps.filter(s => s.tool === 'Delete')
  expect(deletes.length).toBe(1)
  expect(deletes[0]).toMatchObject({ rel: 'src/a.ts', note: 'deleted' })
  expect(deletes[0]!.diff.map(l => l.op + l.t)).toEqual(['-alpha', '-beta'])
  await ui.unmount()
})

test('a file the person deletes outside a turn is kept as deleted by you, in a turn of its own', async ($, on) => {
  const { dirs, files, remove } = project()
  const { clock, history } = world(on, { dirs, files })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/src'))
  await clock.advance(10_000)
  remove('C:/work/demo/src', 'b.ts')
  await tool(ui, 'refresh')
  await clock.settle()
  const turn = lastTurn(history)
  expect(turn.prompt).toBe('Deleted outside Claude')
  // Untracked (no repo here): no copy to be had once it is gone.
  expect(turn.steps.map(s => [s.tool, s.rel, s.note])).toEqual([['Delete', 'src/b.ts', 'deleted by you · no copy kept']])
  expect(await rowText(ui, touchedKey('C:/work/demo/src/b.ts'))).toMatch(/b\.ts.*Deleted by you/)
  // Seen again and again, it is recorded once.
  await tool(ui, 'refresh')
  await clock.settle()
  expect(history.at(-1)!.filter(t => t.prompt === 'Deleted outside Claude').length).toBe(1)
  await ui.unmount()
})

test('a renamed file (one gone, one new in the same folder) is not taken for a deletion', async ($, on) => {
  const { dirs, files, remove } = project()
  const { clock, history } = world(on, { dirs, files })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await pressRow(ui, rowKey('C:/work/demo/src'))
  await clock.advance(10_000)
  remove('C:/work/demo/src', 'b.ts')
  dirs['C:/work/demo/src']!.push(['c.ts', 'file'])
  await tool(ui, 'refresh')
  await clock.settle()
  expect(history.flat().some(t => t.steps.some(s => s.tool === 'Delete'))).toBe(false)
  await ui.unmount()
})

test('a tracked file deleted in a closed folder is found by git, its text taken from HEAD', async ($, on) => {
  const { dirs, files, remove } = project()
  const git = { top: 'C:/work/demo', status: '## main\0', numstat: '', lsFiles: '', show: '' }
  const { clock, history } = world(on, { dirs, files, git })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await clock.advance(10_000)
  // src is closed: only git can see b.ts go.
  remove('C:/work/demo/src', 'b.ts')
  git.status = '## main\0 D src/b.ts\0'
  git.lsFiles = 'src/b.ts\0'
  git.show = 'kept\n'
  await tool(ui, 'refresh')
  await clock.advance(1000)
  const turn = lastTurn(history)
  expect(turn.steps.map(s => [s.rel, s.note])).toEqual([['src/b.ts', 'deleted by you']])
  expect(turn.steps[0]!.diff.map(l => l.op + l.t)).toEqual(['-kept'])
  await ui.unmount()
})
