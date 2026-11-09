import { expect, test } from 'claude-code/testing'

import { addRun, disagreement, formatDuration, testScope } from '../hooks/test-runs'
import type { TestRun } from '../types'
import { DONE, PANE, START, hasText, plain, world } from './world'

test('testScope: a run that names a test file or filters by name is per-file; the rest are full runs', () => {
  expect(testScope('npm test')).toBe('full')
  expect(testScope('pytest')).toBe('full')
  expect(testScope('pytest tests/')).toBe('full')
  expect(testScope('claude plugin test .')).toBe('full')
  expect(testScope('go test ./...')).toBe('full')
  expect(testScope('pytest tests/test_a.py')).toBe('file')
  expect(testScope('pytest tests/test_a.py::test_x -q')).toBe('file')
  expect(testScope('npx vitest run src/a.test.ts')).toBe('file')
  expect(testScope('npm test -- tests/a.test.tsx')).toBe('file')
  expect(testScope('pytest -k greet')).toBe('file')
  expect(testScope('jest --testNamePattern greet')).toBe('file')
  expect(testScope('cd sub && npm test')).toBe('full')
})

test('formatDuration', () => {
  expect(formatDuration(0)).toBe('0ms')
  expect(formatDuration(840)).toBe('840ms')
  expect(formatDuration(3_240)).toBe('3.2s')
  expect(formatDuration(63_000)).toBe('1m 3s')
})

const run = (over: Partial<TestRun> = {}): TestRun => ({ command: 'npm test', ok: true, at: 1, ms: 100, scope: 'full', ...over })

test('addRun keeps the last run and the last of each scope', () => {
  const a = addRun(null, run({ scope: 'file', command: 'pytest t.py' }))
  expect(a).toEqual({ last: run({ scope: 'file', command: 'pytest t.py' }), file: run({ scope: 'file', command: 'pytest t.py' }) })
  const b = addRun(a, run({ ok: false, at: 2 }))
  expect(b.last.at).toBe(2)
  expect(b.file?.command).toBe('pytest t.py')
  expect(b.full?.ok).toBe(false)
})

test('disagreement: only when a per-file run and a full run both exist and gave different results', () => {
  expect(disagreement(null)).toBe(null)
  expect(disagreement(addRun(null, run()))).toBe(null)
  const both = addRun(addRun(null, run({ scope: 'file', ok: true })), run({ scope: 'full', ok: false }))
  expect(disagreement(both)).toBe('per-file run passed, full run failed')
  const flipped = addRun(addRun(null, run({ scope: 'file', ok: false })), run({ scope: 'full', ok: true }))
  expect(disagreement(flipped)).toBe('per-file run failed, full run passed')
  expect(disagreement(addRun(both, run({ scope: 'full', ok: true, at: 9 })))).toBe(null)
})

const lineOf = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => plain(t.text)).find((t: string) => /Tests (passed|failed) ·/.test(t))

test('the last test run stays on the card after the chip is gone: command, result, time, how long', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // Nothing run yet: no line.
  expect(await lineOf(ui)).toBeUndefined()
  await $.turn.start({ turnId: 't1', text: 'test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(6000)
  // The chip (the crab's pill) is gone after FLASH_MS; the line is not.
  expect(await hasText(ui, ' Tests passed ')).toBe(false)
  expect(await lineOf(ui)).toMatch(/^✓ Tests passed · npm test · \d\d:\d\d · \d+ms$/)
  await $.tool.call({ tool: 'Bash', command: 'npm test --fail' } as never)
  await clock.advance(6000)
  expect(await lineOf(ui)).toMatch(/^✗ Tests failed · npm test --fail · /)
  await ui.unmount()
})

test('a per-file run and a full run that disagree are flagged; agreeing again clears it', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'pytest tests/test_a.py' } as never)
  await $.tool.call({ tool: 'Bash', command: 'pytest --fail' } as never)
  await clock.advance(6000)
  expect(await hasText(ui, '⚠ per-file run passed, full run failed')).toBe(true)
  await $.tool.call({ tool: 'Bash', command: 'pytest' } as never)
  await clock.advance(6000)
  expect(await hasText(ui, '⚠ per-file run passed, full run failed')).toBe(false)
  await ui.unmount()
})

test('a test command a hook refused is not a run', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test --hook-says-no' } as never)
  await clock.advance(6000)
  expect(await lineOf(ui)).toBeUndefined()
  await $.turn.complete({ ...DONE, turnId: 't1' } as never)
  await ui.unmount()
})

test('PowerShell test runs are kept too', async ($, on) => {
  const { clock } = world(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.turn.start({ turnId: 't1', text: 'test' } as never)
  await $.tool.call({ tool: 'PowerShell', command: 'dotnet test' } as never)
  await clock.advance(6000)
  expect(await lineOf(ui)).toMatch(/^✓ Tests passed · dotnet test · /)
  await ui.unmount()
})
