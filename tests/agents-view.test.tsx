import { expect, test } from 'claude-code/testing'

import { DONE, PANE, START, plain, world } from './world'

const NARROW = { ...PANE, props: { ...PANE.props, bodyColumns: 36 } } as const
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

const texts = async (ui: any): Promise<string[]> => (await ui.findAll({ type: 'Text' })).map((t: any) => plain(t.text))
const labelOf = async (ui: any, key: string): Promise<string | undefined> => {
  const el = await ui.find({ key })
  return el ? plain(el.label ?? el.props?.label) : undefined
}
const spawn = async ($: any, description: string, subagentType = 'Explore') => String((await $.agent.spawn({ prompt: description, description, subagentType })).agentId)

test('the tab is there from the start, with no strip until a helper starts; then the tab counts those at work and the card names them', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...PANE })
    expect(await labelOf(ui, 'tab-agents')).toBe('Agents')
    expect(await ui.find({ key: 'helper-strip' })).toBeUndefined()
    await ui.unmount()
  }
  const id = await spawn($, 'Read the notes')
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\a.md', agentId: id } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...PANE })
    expect(await labelOf(ui, 'tab-agents')).toBe('Agents 1')
    // The first helper turned the pane to the Agents tab by itself; the strip is on the Files tab.
    await ui.press({ key: 'tab-files' })
    expect(await labelOf(ui, `strip-${id}`)).toBe('◐ Explore · Read the notes · 1')
    await ui.unmount()
  }
})

test('the strip names the two newest at work and counts the rest; a press on it opens the Agents tab with a card each', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const a = await spawn($, 'First job')
  const b = await spawn($, 'Second job', 'Plan')
  const c = await spawn($, 'Third job', 'general-purpose')
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ key: `strip-${c}` })).toBeDefined()
  expect(await ui.find({ key: `strip-${b}` })).toBeDefined()
  expect(await ui.find({ key: `strip-${a}` })).toBeUndefined()
  expect(await labelOf(ui, 'strip-more')).toBe('+1 more helper')
  await ui.press({ key: 'strip-more' })
  const lines = await texts(ui)
  expect(lines).toContain('3 helpers this session · 3 working')
  for (const id of [a, b, c]) expect(await ui.find({ key: `agent-${id}` })).toBeDefined()
  expect(await labelOf(ui, 'tab-agents')).toBe('Agents 3')
  await ui.unmount()
})

test('a card says what the helper did: its calls, how long, and its files, a press on one shows it in the pane', async ($, on) => {
  const { clock } = world(on, { files: { 'C:\\work\\demo\\a.md': '# a\nhello\n' } })
  await $.session.start(START)
  await clock.settle()
  const id = await spawn($, 'Read the notes')
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\a.md', agentId: id } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', path: 'C:\\work\\demo', agentId: id } as never)
  await clock.advance(5000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-agents' })
  let lines = await texts(ui)
  expect(lines).toContain('◉ a.md · 5.0s · 2 calls')
  // The files stay under the task until the row is opened.
  expect(await ui.find({ key: `file-${id}-C:/work/demo/a.md` })).toBeUndefined()
  await ui.press({ key: `agent-head-${id}` })
  expect(await labelOf(ui, `file-${id}-C:/work/demo/a.md`)).toBe('◉ a.md')
  await $.turn.complete({ ...DONE, agentId: id } as never)
  lines = await texts(ui)
  expect(lines).toContain('done · ◉ a.md · 5.0s · 2 calls')
  // Nothing works now: the strip is gone and the tab says how many there were.
  await ui.press({ key: 'tab-files' })
  expect(await ui.find({ key: 'helper-strip' })).toBeUndefined()
  expect(await labelOf(ui, 'tab-agents')).toBe('Agents · 1')
  await ui.press({ key: 'tab-agents' })
  await ui.press({ key: `file-${id}-C:/work/demo/a.md` })
  // The Files tab, the file open in the pane (its "← files" button is drawn).
  expect(await ui.find({ key: 'preview-back' })).toBeDefined()
  expect(await ui.find({ key: 'agent-' + id })).toBeUndefined()
  await ui.unmount()
})

test('the tab opened with no helper says so; the engine\'s own list fills it when the tab opens', async ($, on) => {
  const w = world(on, {})
  await $.session.start(START)
  await w.clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  const r = await $.command.run({ ...TYPED, command: 'trail', args: 'agents' })
  expect(r.text).toBe('filetrail opened on the helpers.')
  expect(await ui.find({ key: 'tab-agents' })).toBeDefined()
  expect((await texts(ui)).some(t => t.startsWith('No helpers yet'))).toBe(true)
  // A helper the module never saw start: the list shows it on the next opening of the tab.
  w.agents.push({ id: 'late1', type: 'Plan', description: 'Plan the move', status: 'running' })
  await $.command.run({ ...TYPED, command: 'trail', args: 'agents' })
  expect(await ui.find({ key: 'agent-late1' })).toBeDefined()
  expect((await texts(ui)).some(t => t.includes('Plan'))).toBe(true)
  await ui.unmount()
})

test('a narrow pane (36 columns) still draws the tab, the strip and the cards', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const id = await spawn($, 'A task with a rather long description that must not run out of the card')
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...NARROW })
    await ui.press({ key: 'tab-files' })
    const strip = await labelOf(ui, `strip-${id}`)
    expect(strip).toBeDefined()
    expect(strip!.length).toBeLessThanOrEqual(34)
    await ui.press({ key: 'tab-agents' })
    expect(await ui.find({ key: `agent-${id}` })).toBeDefined()
    // The tab stays as left across mounts: back to Files for the next surface.
    await ui.press({ key: 'tab-files' })
    await ui.unmount()
  }
})
