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
  // No line above the groups: the group's head says how many there are and how many work.
  expect(lines.some(t => t.includes('this session'))).toBe(false)
  expect(lines.some(t => /^Earlier · 3 helpers · 3 working · /.test(t))).toBe(true)
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
  // Two lines: ▸, the task and how long on the first; the bar, the model and the calls on the second.
  expect(await labelOf(ui, `agent-head-${id}`)).toBe('▸ Read the notes')
  expect(lines).toContain('5.0s')
  expect(lines).toContain('Sonnet 5.5 · 2 calls')
  // The file it is on is not on the row; the files stay under the task until the row is opened.
  expect(lines.some(t => t.includes('◉ a.md'))).toBe(false)
  expect(await ui.find({ key: `file-${id}-C:/work/demo/a.md` })).toBeUndefined()
  await ui.press({ key: `agent-head-${id}` })
  expect(await labelOf(ui, `agent-head-${id}`)).toBe('▾ Read the notes')
  expect(await labelOf(ui, `file-${id}-C:/work/demo/a.md`)).toBe('◉ a.md')
  await $.turn.complete({ ...DONE, agentId: id } as never)
  lines = await texts(ui)
  expect(lines).toContain('Sonnet 5.5 · 2 calls')
  expect(lines).toContain('5.0s')
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

/** Every element under `node`, itself first. */
const under = (node: any): any[] => (node && typeof node === 'object' ? [node, ...(node.children ?? []).flatMap(under)] : [])
/** The text of an element, its pieces joined. */
const textOf = (node: any): string => (typeof node === 'string' ? node : (node?.children ?? []).map(textOf).join(''))
/** A helper row's time bar: its Text made only of bar and axis cells. */
const barOf = async (ui: any, id: string): Promise<string> => {
  const row = await ui.find({ key: `agent-${id}` })
  const bar = under(row).find((n: any) => n.type === 'Text' && /^[━·]+$/.test(textOf(n)))
  return bar ? textOf(bar) : ''
}
/** What a helper row is set in with: its first Text when that is the indent, '' when none. */
const indentIn = async (ui: any, id: string): Promise<string> => {
  const row = await ui.find({ key: `agent-${id}` })
  const first = textOf(row?.children?.[0])
  return first.includes('└') ? first : ''
}

test('a group per main turn, the newest on top; helpers that ran together line up on its time axis, the model first in their facts', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  await $.turn.start({ turnId: 't1', text: 'first' } as never)
  const old = await spawn($, 'Old job')
  await clock.advance(4000)
  await $.turn.complete({ ...DONE, agentId: old } as never)
  await $.turn.complete(DONE as never)
  await clock.advance(60_000)
  await $.turn.start({ turnId: 't2', text: 'second' } as never)
  const a = String((await $.agent.spawn({ prompt: 'A', description: 'Read the code', subagentType: 'Explore', model: 'claude-haiku-5-5' })).agentId)
  await clock.advance(10_000)
  const b = await spawn($, 'Plan the change', 'Plan')
  await clock.advance(10_000)
  await $.turn.complete({ ...DONE, agentId: a } as never)
  await clock.advance(10_000)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...PANE })
    await ui.press({ key: 'tab-agents' })
    const lines = await texts(ui)
    const heads = lines.filter(t => t.startsWith('Turn '))
    expect(heads).toHaveLength(2)
    // b still works: the newer group's head says so.
    expect(heads[0]).toMatch(/^Turn \d\d:\d\d · 2 helpers · 1 working · 30\.0s$/)
    expect(heads[1]).toMatch(/^Turn \d\d:\d\d · 1 helper · 4\.0s$/)
    // The newer group's rows come first, those of the older group after.
    const order = (await ui.findAll({ type: 'Box' })).map((x: any) => x.key).filter((k: any) => typeof k === 'string' && k.startsWith('agent-'))
    expect(order.slice(0, 3)).toEqual([`agent-${a}`, `agent-${b}`, `agent-${old}`])
    expect(lines).toContain('Haiku 5.5')
    expect(lines).toContain('20.0s')
    // a worked the first two thirds of t2's axis, b the last two thirds: their spans overlap in the middle.
    const barA = await barOf(ui, a)
    const barB = await barOf(ui, b)
    expect(barA.length).toBe(barB.length)
    expect(barA.startsWith('━')).toBe(true)
    expect(barA.endsWith('·')).toBe(true)
    expect(barB.startsWith('·')).toBe(true)
    expect(barB.endsWith('━')).toBe(true)
    const mid = Math.floor(barA.length / 2)
    expect(barA[mid]).toBe('━')
    expect(barB[mid]).toBe('━')
    // The old group's lone helper fills its own axis.
    expect(await barOf(ui, old)).not.toContain('·')
    await ui.unmount()
  }
})

test('a helper the engine names as another\'s goes under it, set in with └; helpers with no turn are "Earlier"', async ($, on) => {
  const { clock } = world(on, {
    agents: [
      { id: 'mom', type: 'general-purpose', description: 'Split the work', status: 'running' },
      { id: 'kid', type: 'Explore', description: 'Read a part', status: 'running', parentId: 'mom' },
      { id: 'grandkid', type: 'Explore', description: 'Read less', status: 'running', parentId: 'kid' },
      { id: 'deep', type: 'Explore', description: 'Read least', status: 'running', parentId: 'grandkid' },
    ],
  })
  await $.session.start(START)
  await clock.settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...NARROW })
    await ui.press({ key: 'tab-agents' })
    const lines = await texts(ui)
    expect(lines.some(t => /^Earlier · 4 helpers · /.test(t))).toBe(true)
    const order = (await ui.findAll({ type: 'Box' })).map((x: any) => x.key).filter((k: any) => typeof k === 'string' && k.startsWith('agent-'))
    expect(order).toEqual(['agent-mom', 'agent-kid', 'agent-grandkid', 'agent-deep'])
    expect(await indentIn(ui, 'mom')).toBe('')
    expect(await indentIn(ui, 'kid')).toBe('└ ')
    expect(await indentIn(ui, 'grandkid')).toBe('  └ ')
    // Past two levels a row stays at the second.
    expect(await indentIn(ui, 'deep')).toBe('  └ ')
    // At 36 columns, set in two levels, the bar still keeps inside the pane.
    for (const id of ['mom', 'kid', 'grandkid', 'deep']) expect((await barOf(ui, id)).length).toBeLessThanOrEqual(30)
    await ui.unmount()
  }
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
