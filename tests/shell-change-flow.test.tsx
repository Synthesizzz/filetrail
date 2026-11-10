import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { DONE, PANE, START, rowText, world } from './world'

const touchedKey = (path: string) => `touched-${path.toLowerCase()}`
const GUIDE = 'C:\\work\\demo\\docs\\guide.md'
const part = (i: number, body: number) => `## Part ${i}\n${'x'.repeat(body)}\n`
const doc = (parts: number, body: number) => Array.from({ length: parts }, (_, i) => part(i, body)).join('')

/** A project with one guide of six parts and a script; a test's command rewrites the guide by editing `files`. */
function project(onBash?: (files: Record<string, string>, command: string) => void) {
  const files: Record<string, string> = { [GUIDE]: doc(6, 400), 'C:\\work\\demo\\fix.py': 'print()\n', 'C:\\work\\demo\\README.md': '# Demo\n' }
  const dirs: Record<string, [string, 'file' | 'dir'][]> = {
    'C:\\work\\demo': [['docs', 'dir'], ['fix.py', 'file'], ['README.md', 'file']],
    'C:/work/demo/docs': [['guide.md', 'file']],
  }
  return { files, dirs, onBash: (command: string) => onBash?.(files, command) }
}

const lastTurn = (history: Turn[][]): Turn => history.at(-1)!.at(-1)!

test('a command that shrinks a file it names is kept in the turn, with the old text, and flagged on the card', async ($, on) => {
  const { files, dirs, onBash } = project((f, c) => { if (c.startsWith('python fix.py')) f[GUIDE] = doc(6, 100) })
  const { clock, history } = world(on, { dirs, files, onBash })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'tidy the guide' } as never)
  await $.tool.call({ tool: 'Bash', command: 'python fix.py docs/guide.md' } as never)
  await clock.advance(200)
  await ui.advance(500)
  expect(await rowText(ui, touchedKey('C:/work/demo/docs/guide.md'))).toMatch(/guide\.md.*Shrank −73%/)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  const turn = lastTurn(history)
  const steps = turn.steps.filter(s => s.tool === 'Bash')
  expect(steps.length).toBe(1)
  expect(steps[0]).toMatchObject({ rel: 'docs/guide.md', status: 'ok', note: 'shrank 2.5k → 666 (−73%)' })
  // What was lost is kept as removed lines: each part's old 400-character line, six of them.
  expect(steps[0]!.diff.filter(l => l.op === '-' && l.t === 'x'.repeat(400)).length).toBe(6)
  expect(steps[0]!.del).toBe(6)
  await ui.unmount()
})

test('a command that leaves its files as they were, or grows them, makes no step and no flag', async ($, on) => {
  const { files, dirs, onBash } = project((f, c) => { if (c === 'python fix.py docs/guide.md --grow') f[GUIDE] = doc(7, 400) })
  const { clock, history } = world(on, { dirs, files, onBash })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'check' } as never)
  await $.tool.call({ tool: 'Bash', command: 'python fix.py docs/guide.md' } as never)
  await $.tool.call({ tool: 'Bash', command: 'python fix.py docs/guide.md --grow' } as never)
  await clock.advance(200)
  expect(await ui.find({ key: touchedKey('C:/work/demo/docs/guide.md') })).toBeUndefined()
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  // The only history written is the empty one loaded at the start.
  expect(history.at(-1)).toEqual([])
  await ui.unmount()
})

test('a truncating redirect over an existing file is flagged Overwritten; a new file is not', async ($, on) => {
  const { files, dirs, onBash } = project((f, c) => {
    if (c === 'echo hi > README.md') f['C:\\work\\demo\\README.md'] = 'hi\n'
    if (c === 'echo hi > fresh.md') f['C:\\work\\demo\\fresh.md'] = 'hi\n'
  })
  const { clock, history } = world(on, { dirs, files, onBash })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'write' } as never)
  await $.tool.call({ tool: 'Bash', command: 'echo hi > README.md' } as never)
  await $.tool.call({ tool: 'Bash', command: 'echo hi > fresh.md' } as never)
  await clock.advance(200)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  const steps = lastTurn(history).steps.filter(s => s.tool === 'Bash')
  expect(steps.map(s => [s.rel, s.note])).toEqual([['README.md', 'overwritten 7 → 3 · ## 1 → 0']])
  await ui.unmount()
})

test('a file that cannot be read before the command is left out, and the command still runs', async ($, on) => {
  const { files, dirs, onBash } = project()
  const { clock, history } = world(on, { dirs, files, onBash, unreadable: ['guide.md'] })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'x' } as never)
  const r: any = await $.tool.call({ tool: 'Bash', command: 'python fix.py docs/guide.md' } as never)
  expect(r.result).toBe('ok')
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  expect(history.at(-1)).toEqual([])
})
