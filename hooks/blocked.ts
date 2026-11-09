// Tool calls that were refused or failed, for History: what the call was, why it did not go
// through, and who stopped it. A guess from what the engine reports: a `deny` answer is a
// hook or plugin refusing; an error is read for words that say a hook or Claude Code's own
// permission system refused it, and is a plain failure otherwise. No engine calls here.

import type { Blocked, BlockedKind } from '../types'

/** Characters of a call's text and of a reason that are kept. */
export const CALL_MAX = 160
export const REASON_MAX = 200
/** The keys a call is named by, in order: the first one it has. */
const CALL_KEYS = ['command', 'file_path', 'notebook_path', 'pattern', 'path', 'url', 'query', 'description', 'prompt'] as const

/** One line of text, spaces tidied, cut to `max`. */
function oneLine(text: string, max: number): string {
  const line = (text.split(/\r?\n/).find(l => l.trim() !== '') ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max) : line
}

/** What a call acts on, for its line in History: the command, the file, the pattern, the address; '' when it names none. */
export function callText(call: { tool: string; [k: string]: unknown }): string {
  for (const key of CALL_KEYS) {
    const v = call[key]
    if (typeof v === 'string' && v.trim()) return oneLine(v, CALL_MAX)
  }
  return ''
}

/** Words of a hook's refusal as Claude Code reports it ("PreToolUse:Bash hook error"). */
const HOOK_WORDS = /\bhooks?\b/i
/** Words of Claude Code's own refusals: a person saying no, the permission rules, auto mode's check. */
const HARNESS_WORDS = /doesn'?t want to proceed|tool use was rejected|\buser (refused|rejected|denied|declined)|permissions? (rule|setting|mode|prompt|to use)|auto mode|classifier|requires approval|was blocked/i

/**
 * Whether a call's result says it was stopped, and why: null for one that was answered.
 * `deny` (a hook or plugin refusing) is `hook` unless its words are Claude Code's own; an
 * error is `hook`, `harness` or a plain `failed` by what its text says.
 */
export function blockedOf(result: unknown): { kind: BlockedKind; reason: string } | null {
  if (!result || typeof result !== 'object') return null
  const r = result as { deny?: unknown; isError?: unknown; text?: unknown; result?: unknown }
  const deny = typeof r.deny === 'string' ? r.deny : null
  if (deny === null && r.isError !== true) return null
  const raw = deny ?? (typeof r.text === 'string' ? r.text : typeof r.result === 'string' ? r.result : '')
  const kind: BlockedKind = HOOK_WORDS.test(raw) ? 'hook' : HARNESS_WORDS.test(raw) ? 'harness' : deny !== null ? 'hook' : 'failed'
  return { kind, reason: oneLine(raw, REASON_MAX) }
}

/** The words History uses for who stopped a call. */
export const KIND_LABEL: Record<BlockedKind, string> = {
  hook: 'refused (hook)',
  harness: 'refused (Claude Code)',
  failed: 'failed',
}

/** A blocked call's line, as the export writes it. */
export function blockedLine(b: Blocked): string {
  return [KIND_LABEL[b.kind], b.tool, b.call ? `\`${b.call}\`` : '', b.reason].filter(Boolean).join(' · ')
}
