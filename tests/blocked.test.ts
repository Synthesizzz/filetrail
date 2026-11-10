import { expect, test } from 'claude-code/testing'

import { blockedOf, callText } from '../hooks/blocked'
import { summaryText, withoutIgnored } from '../hooks/history-view'
import { hintFor } from '../hooks/band'
import { historyMarkdown } from '../hooks/export'
import type { Blocked, Turn } from '../types'

test('callText names the call by what it acts on: the command, the file, the pattern', () => {
  expect(callText({ tool: 'Bash', command: 'rm -rf build\necho done' })).toBe('rm -rf build')
  expect(callText({ tool: 'Read', file_path: 'C:/work/demo/a.md' })).toBe('C:/work/demo/a.md')
  expect(callText({ tool: 'Grep', pattern: 'greet', path: 'src' })).toBe('greet')
  expect(callText({ tool: 'WebFetch', url: 'https://example.com/x' })).toBe('https://example.com/x')
  expect(callText({ tool: 'Agent', description: 'review the diff' })).toBe('review the diff')
  expect(callText({ tool: 'Mystery' })).toBe('')
  expect(callText({ tool: 'Bash', command: 'x'.repeat(300) }).length).toBe(160)
})

test('blockedOf: an answered call is not blocked', () => {
  expect(blockedOf({ result: 'ok' })).toBe(null)
  expect(blockedOf(undefined)).toBe(null)
})

test('blockedOf: a deny is a hook refusing, unless its words are the permission system\'s', () => {
  expect(blockedOf({ deny: 'Not now: the build is frozen.' })).toEqual({ kind: 'hook', reason: 'Not now: the build is frozen.' })
  expect(blockedOf({ deny: 'The user refused this edit.' })).toEqual({ kind: 'harness', reason: 'The user refused this edit.' })
})

test('blockedOf: an error whose text says a hook blocked it, or the permission system did, or neither', () => {
  expect(blockedOf({ isError: true, result: 'x', text: 'PreToolUse:Bash hook error: [check]: Blocked: use the other tool' }))
    .toMatchObject({ kind: 'hook', reason: 'PreToolUse:Bash hook error: [check]: Blocked: use the other tool' })
  expect(blockedOf({ isError: true, result: 'x', text: "The user doesn't want to proceed with this tool use. The tool use was rejected." }))
    .toMatchObject({ kind: 'harness' })
  expect(blockedOf({ isError: true, result: 'x', text: 'Permission to use Edit has been denied because Claude Code is running in auto mode.' }))
    .toMatchObject({ kind: 'harness' })
  expect(blockedOf({ isError: true, result: 'File does not exist.' })).toEqual({ kind: 'failed', reason: 'File does not exist.' })
  // A file system's own refusal is a failure, not the harness.
  expect(blockedOf({ isError: true, result: 'EACCES: permission denied, open a.txt' })).toMatchObject({ kind: 'failed' })
})

// Texts as a real engine reported them for each way a call stops: every one is `{ ref, result, text, isError }`.
test('blockedOf: the texts a real engine gave for a rule refusal, a hook, a permission not granted and plain failures', () => {
  const stopped = (text: string) => blockedOf({ ref: 1, result: `Error: ${text}`, text, isError: true })
  expect(stopped('Permission to use Bash with command echo nope has been denied.'))
    .toEqual({ kind: 'harness', reason: 'Permission to use Bash with command echo nope has been denied.' })
  expect(stopped("Claude requested permissions to write to C:\\work\\demo\\x.txt, but you haven't granted it yet."))
    .toMatchObject({ kind: 'harness' })
  expect(stopped('PreToolUse:Bash hook error: [node check.js]: Blocked by the check: this command is not allowed here'))
    .toMatchObject({ kind: 'hook', reason: 'PreToolUse:Bash hook error: [node check.js]: Blocked by the check: this command is not allowed here' })
  expect(stopped('File does not exist. Note: your current working directory is C:\\work\\demo.')).toMatchObject({ kind: 'failed' })
  expect(stopped('Exit code 3')).toEqual({ kind: 'failed', reason: 'Exit code 3' })
  expect(stopped("Exit code 2\nls: cannot access 'nothere-dir': No such file or directory")).toMatchObject({ kind: 'failed', reason: 'Exit code 2' })
  // A failure that only names a hooks folder is not a hook's refusal.
  expect(stopped("Exit code 2\nls: cannot access 'hooks/nothere': No such file or directory")).toMatchObject({ kind: 'failed' })
  // A plugin hook refusing answers a bare `deny` (seen on a real engine), and a hook from settings reads like any hook.
  expect(blockedOf({ deny: 'Scratch plugin says no: this command is not allowed here' }))
    .toEqual({ kind: 'hook', reason: 'Scratch plugin says no: this command is not allowed here' })
  expect(stopped('PreToolUse:Bash hook error: [node "C:\\tools\\guard.js"]: Blocked by guard hook: git push that forces history'))
    .toMatchObject({ kind: 'hook' })
  // Loose words that only some failures happen to contain are not the harness.
  expect(stopped("ModuleNotFoundError: No module named 'classifier'")).toMatchObject({ kind: 'failed' })
  expect(stopped('curl: the request was blocked by the proxy')).toMatchObject({ kind: 'failed' })
  // An answered call carries no isError.
  expect(blockedOf({ ref: 1, result: { stdout: 'fine', stderr: '', interrupted: false }, text: 'fine', isReadOnly: true })).toBe(null)
})

test('blockedOf: the reason is the first line, spaces tidied, cut at 200 characters', () => {
  expect(blockedOf({ deny: 'first   line\nsecond line' })?.reason).toBe('first line')
  expect(blockedOf({ isError: true, result: 'y'.repeat(500) })?.reason.length).toBe(200)
  expect(blockedOf({ isError: true, result: { not: 'text' } })?.reason).toBe('')
})

const blocked = (over: Partial<Blocked> = {}): Blocked => ({ id: 'b1', tool: 'Bash', call: 'rm -rf build', reason: 'no', kind: 'hook', at: 1, ...over })
const step = { id: 's', path: 'C:/work/demo/a.ts', rel: 'a.ts', tool: 'Edit', note: '', status: 'ok' as const, line: 1, add: 1, del: 1, diff: [], at: 1 }

test('a turn with blocked calls says so in its summary; one with none says what it did before', () => {
  const plain: Turn = { id: 't', at: 1, prompt: 'p', steps: [step] }
  expect(summaryText(plain)).toBe('a.ts · 1 edit · +1 -1')
  expect(summaryText({ ...plain, blocked: [blocked()] })).toBe('a.ts · 1 edit · +1 -1 · 1 blocked')
  // An Edit refused is already "not applied": it is not counted twice in the summary.
  expect(summaryText({ ...plain, blocked: [blocked(), blocked({ id: 'b2', tool: 'Edit' })] })).toBe('a.ts · 1 edit · +1 -1 · 1 blocked')
  expect(summaryText({ id: 't', at: 1, prompt: 'p', steps: [], blocked: [blocked(), blocked({ id: 'b2', tool: 'Read', kind: 'failed' })] })).toBe('no file edits · 2 blocked')
})

test('a turn left with only blocked calls stays on the timeline; one with nothing left is hidden', () => {
  const only: Turn = { id: 't', at: 1, prompt: 'p', steps: [step], blocked: [blocked()] }
  const { turns, hidden } = withoutIgnored([only, { id: 'u', at: 2, prompt: 'q', steps: [step] }], ['c:/work/demo/a.ts'])
  expect(turns.map(t => [t.id, t.steps.length])).toEqual([['t', 0]])
  expect(hidden).toBe(1)
})

test('the replay offer needs an edit: a turn with blocked calls alone offers none', () => {
  expect(hintFor({ id: 't', at: 1, prompt: '', steps: [], blocked: [blocked()] })).toBe(null)
})

test('the export lists a turn\'s blocked calls', () => {
  const md = historyMarkdown('C:/work/demo', [{ id: 't', at: 1_800_000_000_000, prompt: 'p', steps: [], blocked: [blocked({ reason: 'frozen' })] }], 1_800_000_000_000)
  expect(md).toContain('### Blocked calls')
  expect(md).toContain('- refused (hook) · Bash · `rm -rf build` · frozen')
})
