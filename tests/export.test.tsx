import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { ASK_MAX_LINES, askText, fileStamp, historyMarkdown, projectName, stamp } from '../hooks/export'
import { KEY, PANE, START, world } from './world'

const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const AT = new Date(2026, 9, 17, 17, 5).getTime()

const step = (over: Partial<Step> = {}): Step => ({
  id: 't1.0.0', path: 'C:/work/demo/src/a.ts', rel: 'src/a.ts', tool: 'Edit', note: '', status: 'ok',
  line: 2, add: 1, del: 1, diff: [{ op: '-', t: 'greet' }, { op: '+', t: 'welcome' }], at: AT, ...over,
})
const T1: Turn = { id: 't1', at: AT, prompt: 'rename greet', steps: [step(), step({ id: 't1.1.0', rel: 'src/b.ts', path: 'C:/work/demo/src/b.ts', status: 'denied', line: null })] }

test('stamps and project names are local time and file-name safe', () => {
  expect(stamp(AT)).toBe('2026-10-17 17:05')
  expect(fileStamp(AT)).toBe('20261017-1705')
  expect(projectName('C:\\work\\my demo (v2)\\')).toBe('my-demo-v2-')
})

test('askText quotes the step for the prompt box and caps the diff', () => {
  expect(askText(step(), T1)).toBe([
    'About this edit Claude made earlier:',
    'File: src/a.ts (line 2)',
    'Turn: 2026-10-17 17:05 "rename greet"',
    'Edit · +1 -1',
    '```diff', '- greet', '+ welcome', '```',
    '', '',
  ].join('\n'))
  const long = step({ diff: Array.from({ length: ASK_MAX_LINES + 5 }, (_, k) => ({ op: '+' as const, t: `l${k}` })), status: 'failed' })
  const text = askText(long, { ...T1, prompt: '' })
  expect(text).toContain('Edit · failed · +1 -1')
  expect(text).toContain('  … 5 more lines')
  expect(text).not.toContain('Turn: 2026-10-17 17:05 "')
})

test('historyMarkdown lays out every turn and step', () => {
  const md = historyMarkdown('C:\\work\\demo', [T1], AT)
  expect(md.startsWith('# filetrail history: demo\n\nProject: `C:/work/demo`\nExported: 2026-10-17 17:05\nTurns: 1, edits: 2\n')).toBe(true)
  expect(md).toContain('## 2026-10-17 17:05 · rename greet')
  expect(md).toContain('### src/a.ts (line 2)\n\nEdit · +1 -1\n\n```diff\n- greet\n+ welcome\n```')
  expect(md).toContain('### src/b.ts\n\nEdit · denied · +1 -1')
})

test('/trail export writes under ~/.claude/filetrail/exports and says where, slashes forward', async ($, on) => {
  const { writes } = world(on, { stored: { [KEY]: [T1] }, now: AT, env: { USERPROFILE: 'C:\\Users\\me' } })
  await $.session.start(START)
  const r = await $.command.run({ ...TYPED, command: 'trail', args: 'export' })
  const path = 'C:/Users/me/.claude/filetrail/exports/demo-20261017-1705.md'
  expect(r.text).toBe(`filetrail: exported 1 turn to ${path}`)
  expect(writes[path]).toContain('## 2026-10-17 17:05 · rename greet')
})

test('/trail export with no history writes nothing', async ($, on) => {
  const { writes } = world(on, { env: { HOME: '/home/me' } })
  await $.session.start(START)
  const r = await $.command.run({ ...TYPED, command: 'trail', args: 'export' })
  expect(r.text).toBe('filetrail: nothing to export yet, no edits recorded in this project.')
  expect(Object.keys(writes)).toEqual([])
})

test('the Export button writes the file and toasts the path', async ($, on) => {
  const { writes, toasts } = world(on, { stored: { [KEY]: [T1] }, now: AT, env: { HOME: '/home/me' } })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'export' })
  const written = Object.keys(writes)
  expect(written.length).toBe(1)
  expect(written[0]!.endsWith('/home/me/.claude/filetrail/exports/demo-20261017-1705.md')).toBe(true)
  expect(toasts).toEqual(['filetrail: exported 1 turn to /home/me/.claude/filetrail/exports/demo-20261017-1705.md'])
  await ui.unmount()
})

test('Ask Claude appends the step to the prompt box', async ($, on) => {
  const { fills } = world(on, { stored: { [KEY]: [T1] }, now: AT })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'turn-t1' })
  await ui.press({ key: 'ask' })
  expect(fills).toEqual([{ text: askText(T1.steps[0]!, T1), mode: 'append' }])
  await ui.unmount()
})

test('/trail clear asks first, then clears only this project', async ($, on) => {
  const other = { id: 'x', at: 1, prompt: 'elsewhere', steps: [] }
  const index = { [KEY]: { used: 2, bytes: 10 }, 'p:d:/other': { used: 1, bytes: 10 } }
  const { store, history } = world(on, { stored: { [KEY]: [T1], 'p:d:/other': [other], index } })
  await $.session.start(START)

  const ask = await $.command.run({ ...TYPED, command: 'trail', args: 'clear' })
  expect(ask.text).toBe('This deletes 1 turn of filetrail history for demo, for good. Run /trail clear yes to go ahead.')
  expect(store.get(KEY)).toBeDefined()

  const done = await $.command.run({ ...TYPED, command: 'trail', args: 'clear yes' })
  expect(done.text).toBe('filetrail: cleared 1 turn of history for demo.')
  expect(store.get(KEY)).toBeUndefined()
  expect(store.get('p:d:/other')).toEqual([other])
  expect(Object.keys(store.get('index') as object)).toEqual(['p:d:/other'])
  expect(history.at(-1)).toEqual([])

  const again = await $.command.run({ ...TYPED, command: 'trail', args: 'clear' })
  expect(again.text).toBe('filetrail: there is no history to clear in this project.')
})

test('/trail with an unknown argument says what it takes', async ($, on) => {
  world(on)
  const r = await $.command.run({ ...TYPED, command: 'trail', args: 'what' })
  expect(r.text).toContain('/trail export')
  expect(r.text).toContain('/trail clear')
})
