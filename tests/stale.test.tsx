import { expect, test } from 'claude-code/testing'

import { checksum, judgeStale, MAX_READS, remember, staleLabel } from '../hooks/stale'
import type { ReadRecord } from '../hooks/stale'
import type { GitWorld } from './world'
import { DONE, PANE, START, hasText, plain, rowText, world } from './world'

test('checksum: the same text the same, any change another', () => {
  expect(checksum('alpha\nbeta\n')).toBe(checksum('alpha\nbeta\n'))
  expect(checksum('alpha\nbeta\n')).not.toBe(checksum('alpha\nbetb\n'))
  expect(checksum('ab')).not.toBe(checksum('ba'))
  expect(checksum('')).toBe('0:811c9dc5')
})

test('staleLabel names what changed the file, in a fixed order', () => {
  expect(staleLabel(['edit'])).toBe('edited')
  expect(staleLabel(['commit'])).toBe('committed')
  expect(staleLabel(['outside'])).toBe('changed outside')
  expect(staleLabel(['edit', 'commit'])).toBe('edited + committed')
})

const rec = (over: Partial<ReadRecord> = {}): ReadRecord => ({ path: 'C:/work/demo/a.ts', at: 10, sum: '5:abc', head: 'h1', ...over })

test('judgeStale: a Claude edit, a commit, or a change nobody here made; or none', () => {
  expect(judgeStale(rec(), { sum: '5:abc' }, false, false)).toBe(null)
  expect(judgeStale(rec(), { sum: '9:zzz' }, true, false)).toEqual(['edit'])
  expect(judgeStale(rec(), { sum: '5:abc' }, false, true)).toEqual(['commit'])
  expect(judgeStale(rec(), { sum: '9:zzz' }, true, true)).toEqual(['edit', 'commit'])
  expect(judgeStale(rec(), { sum: '9:zzz' }, false, false)).toEqual(['outside'])
  // A change that came with a commit (a pull) is the commit's, not "outside".
  expect(judgeStale(rec(), { sum: '9:zzz' }, false, true)).toEqual(['commit'])
  // A file that cannot be read now (gone, binary) is not judged here: deletions have their own record.
  expect(judgeStale(rec(), { sum: null }, false, false)).toBe(null)
})

test('remember keeps the newest MAX_READS files, a file read again moving to the end', () => {
  const reads = new Map<string, ReadRecord>()
  for (let i = 0; i < MAX_READS + 5; i++) remember(reads, `f${i}`, rec({ path: `f${i}` }))
  expect(reads.size).toBe(MAX_READS)
  expect(reads.has('f0')).toBe(false)
  remember(reads, 'f10', rec({ path: 'f10', at: 99 }))
  expect([...reads.keys()].at(-1)).toBe('f10')
})

const A = 'C:\\work\\demo\\a.ts'
const DIRS: Record<string, [string, 'file' | 'dir'][]> = { 'C:\\work\\demo': [['a.ts', 'file'], ['b.ts', 'file']] }
const rowKey = 'row-c:/work/demo/a.ts'
const touchedKey = 'touched-c:/work/demo/a.ts'
const gitWorld = (over: Partial<GitWorld> = {}): GitWorld => ({ top: 'C:/work/demo', status: '## main\0', numstat: '', head: 'aaa', log: '', ...over })

async function setup($: any, on: any, files: Record<string, string>, git = gitWorld()) {
  const w = world(on, { dirs: DIRS, files, git })
  await $.session.start(START)
  await w.clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  return { ...w, ui, git }
}

const read = ($: any) => $.tool.call({ tool: 'Read', file_path: A } as never)

test('a file Claude read and the person then changed shows "changed outside" on its row and in the touched list', async ($, on) => {
  const files = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await read($)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).not.toMatch(/Δ/)
  // Someone edits the file; the next turn's end notices.
  files[A] = 'one\ntwo\nthree\n'
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/a\.ts.*Δ changed outside/)
  await ui.advance(500)
  expect(await rowText(ui, touchedKey)).toMatch(/a\.ts.*Δ changed outside/)
  await ui.unmount()
})

test('a file Claude read and then edited itself says "edited"; reading it again clears the marker', async ($, on) => {
  const files = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'edit' } as never)
  await read($)
  await clock.advance(50)
  await $.tool.call({ tool: 'Edit', file_path: A, old_string: 'one', new_string: 'uno' } as never)
  files[A] = 'uno\ntwo\n'
  await clock.advance(200)
  expect(await rowText(ui, rowKey)).toMatch(/a\.ts.*Δ edited/)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/Δ edited/)
  // Claude reads it again: what it knows is current, and the marker goes.
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await read($)
  await clock.advance(200)
  expect(await rowText(ui, rowKey)).not.toMatch(/Δ/)
  await ui.unmount()
})

test('a file Claude read and a commit then took says "committed", with or without a change of its text', async ($, on) => {
  const files = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui, git } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await read($)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  // HEAD moves, and git says what differs since: a.ts.
  git.head = 'bbb'
  git.log = 'a.ts\n'
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/a\.ts.*Δ committed/)
  await ui.unmount()
})

test('a file Claude never read, or read and nothing changed, has no marker; a commit of other files is not its commit', async ($, on) => {
  const files = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui, git } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await read($)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  // HEAD moves but git log names no commit for a.ts.
  git.head = 'bbb'
  git.log = ''
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).not.toMatch(/Δ/)
  expect(await rowText(ui, 'row-c:/work/demo/b.ts')).not.toMatch(/Δ/)
  await ui.unmount()
})

test('a binary file is not tracked: read as binary, then changed to text, it gets no marker, and the read still goes through', async ($, on) => {
  const files: Record<string, string> = { [A]: 'bin\u0000ary', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  const r: any = await read($)
  expect(r.result).toBe('ok')
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  files[A] = 'now text\n'
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).not.toMatch(/Δ/)
  await ui.unmount()
})

test('a read that was refused leaves things as they were: no marker taken off, none made', async ($, on) => {
  const files: Record<string, string> = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const refuse: string[] = []
  const w = world(on, { dirs: DIRS, files, git: gitWorld(), refuse })
  await $.session.start(START)
  await w.clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await read($)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  files[A] = 'one\ntwo\nthree\n'
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await w.clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/Δ changed outside/)
  // A hook refuses the next Read: Claude has not seen the new text, so the marker stays.
  refuse.push('a.ts')
  await $.turn.start({ turnId: 't3', text: 'again' } as never)
  const r: any = await read($)
  expect(r.deny).toBeDefined()
  await $.turn.complete({ ...DONE, turnId: 't3' } as never)
  await w.clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/Δ changed outside/)
  await ui.unmount()
})

test('HEAD is asked once for all the reads of a turn, and git once for all the files read at one HEAD', async ($, on) => {
  const files = { [A]: 'one\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ran, git } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await read($)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\b.ts' } as never)
  expect(ran.filter(a => a[1] === 'rev-parse' && a[2] === 'HEAD').length).toBe(1)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  git.head = 'bbb'
  git.log = 'a.ts\nb.ts\n'
  ran.length = 0
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(ran.filter(a => a[1] === 'diff' && a.includes('--name-only')).length).toBe(1)
})

test('Bash readers count: a file cat read and then changed is marked', async ($, on) => {
  const files = { [A]: 'one\ntwo\n', 'C:\\work\\demo\\b.ts': 'b\n' }
  const { clock, ui } = await setup($, on, files)
  await $.turn.start({ turnId: 't1', text: 'look' } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat a.ts' } as never)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  files[A] = 'changed\n'
  await $.turn.start({ turnId: 't2', text: 'again' } as never)
  await $.turn.complete({ ...DONE, turnId: 't2' } as never)
  await clock.advance(1000)
  expect(await rowText(ui, rowKey)).toMatch(/Δ changed outside/)
  expect(await hasText(ui, 'nothing')).toBe(false)
  await ui.unmount()
})
