import { expect, test } from 'claude-code/testing'

import { START, world } from './world'

const GUARDS_KEY = 'filetrail:guards'
const GUARDS = ['C:/work/demo/src', 'C:/work/demo/.env']
const check = ($: any, tool: string, command: string) => $.tool.check({ tool, input: { command } })

test('a shell command that names a guarded path is put to the person, with the guard in the reason', async ($, on) => {
  const { clock } = world(on, { stored: { [GUARDS_KEY]: GUARDS } })
  await $.session.start(START)
  await clock.settle()
  const full = await check($, 'Bash', 'sed -i s/a/b/ C:/work/demo/src/a.ts')
  expect(full.decision).toBe('ask')
  expect(full.reason).toContain('C:/work/demo/src')
  expect(full.reason).toMatch(/guarded in filetrail/)
  expect((await check($, 'Bash', 'rm -rf src')).decision).toBe('ask')
  expect((await check($, 'Bash', 'echo KEY=2 > ./.env')).decision).toBe('ask')
  expect((await check($, 'PowerShell', 'Remove-Item C:\\work\\demo\\src\\a.ts')).decision).toBe('ask')
})

test('a command that names no guarded path runs as the engine decided', async ($, on) => {
  const { clock } = world(on, { stored: { [GUARDS_KEY]: GUARDS } })
  await $.session.start(START)
  await clock.settle()
  expect((await check($, 'Bash', 'ls -la')).decision).toBe('allow')
  expect((await check($, 'Bash', 'rm src2/b.ts')).decision).toBe('allow')
  expect((await check($, 'Bash', 'git status')).decision).toBe('allow')
})

test('with no guards a shell command is left alone, and so is a store that cannot be read', async ($, on) => {
  const none = world(on, {})
  await $.session.start(START)
  await none.clock.settle()
  expect((await check($, 'Bash', 'rm -rf src')).decision).toBe('allow')
})

test('a store that cannot be read leaves a shell command as the engine decided', async ($, on) => {
  const { clock } = world(on, { unreadableKeys: [GUARDS_KEY] })
  await $.session.start(START)
  await clock.settle()
  expect((await check($, 'Bash', 'rm -rf src')).decision).toBe('allow')
})

test('a tool that is not a shell is not read for guards here (edits are refused at the call)', async ($, on) => {
  const { clock } = world(on, { stored: { [GUARDS_KEY]: GUARDS } })
  await $.session.start(START)
  await clock.settle()
  expect((await $.tool.check({ tool: 'Read', input: { file_path: 'C:/work/demo/src/a.ts' } })).decision).toBe('allow')
})
