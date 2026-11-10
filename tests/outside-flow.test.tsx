import { expect, test } from 'claude-code/testing'

import { PANE, START, hasText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = { 'C:\\work\\demo': [['src', 'dir']], 'C:/work/demo/src': [['a.ts', 'file']] }
const HOME = { USERPROFILE: 'C:\\Users\\ana' }
const edit = (file: string, extra: object = {}) => ({ tool: 'Edit', file_path: file, old_string: 'one', new_string: 'uno', ...extra }) as never
const write = (file: string) => ({ tool: 'Write', file_path: file, content: 'x\n' }) as never
const lastOutside = (states: Record<string, unknown[]>) => states.outside?.at(-1)

async function start($: any, on: any, options: object = {}) {
  const w = world(on, { dirs: DIRS, env: HOME, ...options })
  await $.session.start(START)
  await w.clock.advance(1000)
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  return w
}

test('a file Claude writes outside the project goes on the list and a toast says so once', async ($, on) => {
  const { states, toasts } = await start($, on)
  await $.tool.call(edit('C:\\work\\other\\x.ts'))
  expect(lastOutside(states)).toEqual(['C:/work/other/x.ts'])
  expect(toasts.filter(t => t.includes('outside'))).toHaveLength(1)
  expect(toasts.find(t => t.includes('outside'))).toContain('C:/work/other/x.ts')
  await $.tool.call(write('C:\\work\\other\\y.ts'))
  expect(lastOutside(states)).toEqual(['C:/work/other/y.ts', 'C:/work/other/x.ts'])
  expect(toasts.filter(t => t.includes('outside'))).toHaveLength(1)
})

test('a NotebookEdit outside counts, a write inside the project does not', async ($, on) => {
  const { states } = await start($, on)
  await $.tool.call(edit('C:\\work\\demo\\src\\a.ts'))
  await $.tool.call(write('C:\\work\\demo\\new.ts'))
  expect(states.outside).toBeUndefined()
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: 'C:\\work\\other\\n.ipynb', new_source: 'x' } as never)
  expect(lastOutside(states)).toEqual(['C:/work/other/n.ipynb'])
})

test('only a call that went through counts: a refused, failed or guarded write is left out', async ($, on) => {
  const { states } = await start($, on, { refuse: ['refused.ts'], stored: { 'filetrail:guards': ['C:/work/other/guarded'] } })
  await $.tool.call(edit('C:\\work\\other\\refused.ts'))
  await $.tool.call(edit('C:\\work\\other\\broken.ts'))
  await $.tool.call(edit('C:\\work\\other\\guarded\\g.ts'))
  expect(states.outside).toBeUndefined()
})

test("a helper's write counts as Claude's own", async ($, on) => {
  const { states } = await start($, on)
  const spawned = (await $.agent.spawn({ prompt: 'Fix it', description: 'Fix x', subagentType: 'general-purpose' })) as any
  await $.tool.call(edit('C:\\work\\other\\x.ts', { agentId: spawned.agentId }))
  expect(lastOutside(states)).toEqual(['C:/work/other/x.ts'])
})

test("Claude's config folder, a temp folder and a shell command's targets are not counted", async ($, on) => {
  const { states } = await start($, on)
  await $.tool.call(edit('C:\\Users\\ana\\.claude\\settings.json'))
  await $.tool.call(write('C:\\Users\\ana\\AppData\\Local\\Temp\\claude\\s\\scratch.txt'))
  await $.tool.call(write('/tmp/x.txt'))
  await $.tool.call({ tool: 'Bash', command: 'echo hi > C:/work/other/out.txt' } as never)
  expect(states.outside).toBeUndefined()
})

test('inside a repo the repo is the project: its other folders are not outside, a folder beside it is', async ($, on) => {
  const git = { top: 'C:/work', status: '## main\0', numstat: '' }
  const { states } = await start($, on, { git })
  await $.tool.call(edit('C:\\work\\other\\x.ts'))
  expect(states.outside).toBeUndefined()
  await $.tool.call(edit('C:\\elsewhere\\x.ts'))
  expect(lastOutside(states)).toEqual(['C:/elsewhere/x.ts'])
})

test('the card shows a warning with the count, and pressing it lists the files', async ($, on) => {
  const w = await start($, on)
  await $.tool.call(edit('C:\\work\\other\\x.ts'))
  await $.tool.call(edit('C:\\work\\other\\y.ts'))
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await hasText(ui, '⚠ 2 files written outside the project')).toBe(true)
  // A line of its own on a faint warning fill, not a chip among the git ones.
  expect(String((await ui.find({ key: 'chip-outside' }))?.props?.backgroundColor)).toMatch(/22$/)
  expect(JSON.stringify(await ui.find({ key: 'chips' }))).not.toContain('outside-toggle')
  expect((await ui.find({ key: 'outside-toggle' }))?.props?.label).toBe('show')
  expect(await hasText(ui, 'C:/work/other/y.ts')).toBe(false)
  await ui.press({ key: 'outside-toggle' })
  expect(await hasText(ui, 'C:/work/other/y.ts')).toBe(true)
  expect(await hasText(ui, 'C:/work/other/x.ts')).toBe(true)
  expect((await ui.find({ key: 'outside-toggle' }))?.props?.label).toBe('hide')
  await ui.press({ key: 'outside-toggle' })
  expect(await hasText(ui, 'C:/work/other/y.ts')).toBe(false)
  await ui.unmount()
  void w
})

test('with nothing written outside there is no badge', async ($, on) => {
  await start($, on)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'outside-toggle' })).toBeUndefined()
  await ui.unmount()
})
