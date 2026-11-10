import { expect, test } from 'claude-code/testing'

import type { Turn } from '../types'
import { DONE, START, world } from './world'

const GUARDS_KEY = 'filetrail:guards'
const FILES = {
  'C:\\work\\demo\\src\\a.ts': 'one\n',
  'C:\\work\\demo\\src2\\b.ts': 'two\n',
  'C:\\work\\demo\\.env': 'KEY=1\n',
  'C:\\work\\demo\\notes.md': '# notes\n',
}
const lastTurn = (history: Turn[][]): Turn => history.at(-1)!.at(-1)!
const edit = (file: string) => ({ tool: 'Edit', file_path: file, old_string: 'one', new_string: 'uno' }) as never

test('an Edit, Write or NotebookEdit on a guarded file or anything in a guarded folder is refused with the guard named', async ($, on) => {
  const { clock } = world(on, { files: FILES, stored: { [GUARDS_KEY]: ['C:/work/demo/src', 'C:/work/demo/.env'] } })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  const inFolder = (await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))) as any
  expect(inFolder.deny).toContain('C:/work/demo/src')
  expect(inFolder.deny).toMatch(/guarded in filetrail/)
  const written = (await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\.env', content: 'KEY=2\n' } as never)) as any
  expect(written.deny).toContain('C:/work/demo/.env')
  // A file the folder guard holds that is not there yet is held too.
  const added = (await $.tool.call({ tool: 'Write', file_path: 'C:\\Work\\Demo\\SRC\\new.ts', content: 'x\n' } as never)) as any
  expect(added.deny).toContain('C:/work/demo/src')
  const notebook = (await $.tool.call({ tool: 'NotebookEdit', notebook_path: 'C:\\work\\demo\\src\\n.ipynb', new_source: 'x' } as never)) as any
  expect(notebook.deny).toContain('C:/work/demo/src')
})

test('a file the guards do not cover is edited as before, including one whose folder only starts with the same letters', async ($, on) => {
  const { clock } = world(on, { files: FILES, stored: { [GUARDS_KEY]: ['C:/work/demo/src'] } })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  expect(await $.tool.call(edit('C:\\work\\demo\\src2\\b.ts'))).toMatchObject({ result: 'ok' })
  expect(await $.tool.call(edit('C:\\work\\demo\\notes.md'))).toMatchObject({ result: 'ok' })
})

test('with no guards every edit goes through', async ($, on) => {
  const { clock } = world(on, { files: FILES })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  expect(await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))).toMatchObject({ result: 'ok' })
})

test('a call a guard stopped is kept in its turn as refused by a hook, and its step says it was not applied', async ($, on) => {
  const { clock, history } = world(on, { files: FILES, stored: { [GUARDS_KEY]: ['C:/work/demo/src'] } })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(1000)
  const turn = lastTurn(history)
  expect(turn.blocked?.map(b => [b.kind, b.tool, b.call])).toEqual([['hook', 'Edit', 'C:\\work\\demo\\src\\a.ts']])
  expect(turn.blocked?.[0]?.reason).toContain('guarded in filetrail')
  expect(turn.steps.map(s => [s.rel, s.status])).toEqual([['src/a.ts', 'denied']])
})

test("a helper's edit of a guarded file is refused too", async ($, on) => {
  const { clock } = world(on, { files: FILES, stored: { [GUARDS_KEY]: ['C:/work/demo/src'] } })
  await $.session.start(START)
  await clock.settle()
  const spawned = (await $.agent.spawn({ prompt: 'Fix it', description: 'Fix a.ts', subagentType: 'general-purpose' })) as any
  const r = (await $.tool.call({ ...(edit('C:\\work\\demo\\src\\a.ts') as object), agentId: spawned.agentId } as never)) as any
  expect(r.deny).toContain('C:/work/demo/src')
})

test('a link to a guarded file is held by where it lands, not by its own name', async ($, on) => {
  const { clock } = world(on, { files: { ...FILES, 'C:\\work\\demo\\link.ts': 'one\n' }, stored: { [GUARDS_KEY]: ['C:/work/demo/src'] } })
  on('fs.stat', (_$: any, e: any) => ({ value: { realPath: String(e.path).endsWith('link.ts') ? 'C:\\work\\demo\\src\\a.ts' : e.path } }))
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  const r = (await $.tool.call(edit('C:\\work\\demo\\link.ts'))) as any
  expect(r.deny).toContain('C:/work/demo/src')
  expect(await $.tool.call(edit('C:\\work\\demo\\notes.md'))).toMatchObject({ result: 'ok' })
})

test('a store that cannot be read lets the call through and says once that guards are off', async ($, on) => {
  const { clock, toasts } = world(on, { files: FILES, unreadableKeys: [GUARDS_KEY] })
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'change things' } as never)
  expect(await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))).toMatchObject({ result: 'ok' })
  expect(await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))).toMatchObject({ result: 'ok' })
  expect(toasts.filter(t => /guards are off/.test(t))).toHaveLength(1)
})
