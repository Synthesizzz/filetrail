import { expect, test } from 'claude-code/testing'

import { CRABS_MAX } from '../hooks/agents-view'
import { crabSvg } from '../hooks/crab'

import { DONE, PANE, START, world } from './world'

const spawn = async ($: any, description: string, subagentType = 'Explore') => String((await $.agent.spawn({ prompt: description, description, subagentType })).agentId)
const crabs = async (ui: any) => (await ui.findAll({ type: 'Svg' })).filter((s: any) => String(s.props?.alt).startsWith('Crab'))

test('a row opens to its files by a press on its task and stays open across tabs; a second press closes it', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const id = await spawn($, 'Read the notes')
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\a.md', agentId: id } as never)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-agents' })
  const file = `file-${id}-C:/work/demo/a.md`
  expect(await ui.find({ key: file })).toBeUndefined()
  await ui.press({ key: `agent-head-${id}` })
  expect(await ui.find({ key: file })).toBeDefined()
  await ui.press({ key: 'tab-history' })
  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ key: file })).toBeDefined()
  await ui.press({ key: `agent-head-${id}` })
  expect(await ui.find({ key: file })).toBeUndefined()
  await ui.unmount()
})

test('desktop: each row has a crab in a pose for its last file, cheering once done; the terminal keeps a glyph', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const a = await spawn($, 'Write the notes')
  const b = await spawn($, 'Fresh helper')
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\n.md', content: 'x', agentId: a } as never)
  const desk = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await desk.press({ key: 'tab-agents' })
  let found = await crabs(desk)
  expect(found.map((s: any) => s.props.alt).sort()).toEqual(['Crab working: Fresh helper', 'Crab working: Write the notes'])
  const named = (list: any[], end: string) => list.find((c: any) => c.props.alt.endsWith(end))
  expect(named(found, 'Write the notes').props.source).toBe(crabSvg('write', 'Crab working: Write the notes').source)
  expect(named(found, 'Fresh helper').props.source).toBe(crabSvg('think', 'Crab working: Fresh helper').source)
  await $.turn.complete({ ...DONE, agentId: a } as never)
  found = await crabs(desk)
  expect(named(found, 'Write the notes').props.alt).toBe('Crab done: Write the notes')
  expect(named(found, 'Write the notes').props.source).toBe(crabSvg('passed', 'Crab done: Write the notes').source)
  await desk.unmount()
  const term = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await term.press({ key: 'tab-agents' })
  expect(await crabs(term)).toHaveLength(0)
  expect(await term.find({ key: `agent-${b}` })).toBeDefined()
  await term.unmount()
})

test('only the first rows draw a crab; the rest keep the glyph', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  for (let k = 0; k < CRABS_MAX + 3; k++) await spawn($, `Job ${k}`)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-agents' })
  expect(await crabs(ui)).toHaveLength(CRABS_MAX)
  await ui.unmount()
})
