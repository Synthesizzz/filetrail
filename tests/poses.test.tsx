import { expect, test } from './kit'

import { FLASH_MS } from '../hooks/activity'
import { commandKind } from '../hooks/bash'
import { AGENT, COMMAND, GONE, SEARCH } from '../hooks/crab'
import { DONE, PANE, START, hasText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['src', 'dir'], ['README.md', 'file']],
  'C:/work/demo/src': [['app.ts', 'file']],
}
const FILES = { 'C:\\work\\demo\\README.md': '#\n', 'C:\\work\\demo\\src\\app.ts': 'a\n' }

/** The crab's Svg: the card may have the chips' icons too. */
const crabOf = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props?.alt).startsWith('Crab'))
const border = async (ui: any) => (await ui.find({ key: 'now-card' }))?.props?.borderColor

test('commandKind: test runners, searches, and everything else', () => {
  for (const c of ['npm test', 'pnpm run test:unit', 'yarn t', 'npx vitest run', 'npx playwright test', 'pytest -q', 'python -m pytest tests',
    'go test ./...', 'cargo test', 'dotnet test', 'dbt test --select x', 'claude plugin test .', 'cd app && npm test']) {
    expect([c, commandKind(c)]).toEqual([c, 'test'])
  }
  for (const c of ['rg -n greet src', 'grep -r x . | head', 'find . -name "*.ts"', 'Select-String -Path a.ts x']) {
    expect([c, commandKind(c)]).toEqual([c, 'search'])
  }
  for (const c of ['npm run build', 'npm install', 'ls -la && npm run lint', 'echo test', 'Get-ChildItem', 'git status']) {
    expect([c, commandKind(c)]).toEqual([c, 'command'])
  }
})

async function setup($: any, on: any) {
  const w = world(on, { dirs: DIRS, files: FILES })
  await $.session.start(START)
  await w.clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  return { ...w, ui }
}

test('a search: the crab sweeps a magnifying glass, the card names the pattern and folder, then goes', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Grep', pattern: 'greet', path: 'C:\\work\\demo\\src' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Searched "greet" · src')).toBe(true)
  expect(await border(ui)).toBe(SEARCH)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="mg2"')
  await clock.advance(FLASH_MS + 100)
  expect(await hasText(ui, 'Searched "greet" · src')).toBe(false)
  await ui.unmount()
})

test('tests: a passing run cheers, a failing one sweats in red', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Tests passed · npm test')).toBe(true)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab tests passed')
  await clock.advance(FLASH_MS + 100)

  await $.tool.call({ tool: 'Bash', command: 'npm test --fail' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Tests failed · npm test --fail')).toBe(true)
  expect(await border(ui)).toBe(GONE)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="sw"')
  await ui.unmount()
})

test('a command, in Bash or PowerShell: the crab types at a terminal; one that fails is an error', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Ran npm run build')).toBe(true)
  expect(await border(ui)).toBe(COMMAND)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="cu"')

  await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Ran Get-ChildItem')).toBe(true)

  await $.tool.call({ tool: 'Bash', command: 'npm run build --fail' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Command failed npm run build --fail')).toBe(true)
  expect(await border(ui)).toBe(GONE)
  await ui.unmount()
})

test('an edit that fails or is refused: the crab is dizzy, the card says which and where', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Edit', file_path: 'C:\\work\\demo\\src\\broken.ts', old_string: 'x', new_string: 'y' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Edit failed · broken.ts')).toBe(true)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="st"')
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\denied.ts', content: 'x' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Write denied · denied.ts')).toBe(true)
  await clock.advance(FLASH_MS + 100)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab asleep: Claude is idle')
  await ui.unmount()
})

test('a helper: a little crab works beside it, named by its task', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Agent', description: 'review the diff', prompt: 'x' } as never)
  await clock.advance(200)
  expect(await hasText(ui, 'Helper done review the diff')).toBe(true)
  expect(await border(ui)).toBe(AGENT)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="hp"')
  await ui.unmount()
})

test('while a turn runs with nothing else on, the crab thinks; then sleeps', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.turn.start({ turnId: 't1', text: 'look into it' } as never)
  await clock.advance(200)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab thinking')
  expect(await hasText(ui, 'Thinking')).toBe(true)
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await clock.advance(200)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab asleep: Claude is idle')
  await ui.unmount()
})

test('the newest wins: a read after a search shows the read, a search after a read the search', async ($, on) => {
  const { clock, ui } = await setup($, on)
  await $.tool.call({ tool: 'Grep', pattern: 'greet' } as never)
  await clock.advance(100)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\README.md' } as never)
  await clock.advance(100)
  expect(await hasText(ui, 'Reading README.md')).toBe(true)
  await $.tool.call({ tool: 'Grep', pattern: 'other' } as never)
  await clock.advance(100)
  expect(await hasText(ui, 'Searched "other"')).toBe(true)
  await ui.unmount()
})
