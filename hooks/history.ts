// filetrail's edit history: turning tool calls into steps, and keeping the
// stored history inside the store's budget. No engine calls here.

import type { DeletedBy, Step, StepStatus, Turn } from '../types'
import { capDiff, countChanges, diffLines } from './diff'

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
/** Turns kept per project, newest last. */
export const MAX_TURNS = 50
/** Diff lines kept per step; add and del still count the whole diff. */
export const MAX_STEP_LINES = 200
/** Bytes of JSON all projects' histories may take ($.store holds 4 MiB in all). */
export const BUDGET_BYTES = 3 * 1024 * 1024
export const INDEX_KEY = 'index'

/** Where each project's history sits in the store: last use and size. */
export type StoreIndex = Record<string, { used: number; bytes: number }>

/** The fields of an Edit, Write or MultiEdit call that make a step. */
export type EditCall = {
  tool: string
  file_path?: string
  old_string?: string
  new_string?: string
  replace_all?: boolean
  content?: string
  edits?: { old_string?: string; new_string?: string }[]
}

export function normPath(path: string): string {
  return path.replace(/\\/g, '/')
}

/** The store key of a project's history: its root, case-folded (Windows paths ignore case). */
export function projectKey(root: string): string {
  return 'p:' + normPath(root).replace(/\/+$/, '').toLowerCase()
}

export function relTo(root: string, path: string): string {
  const r = normPath(root).replace(/\/+$/, '')
  const p = normPath(path)
  if (r && p.toLowerCase().startsWith(r.toLowerCase() + '/')) return p.slice(r.length + 1)
  return p
}

export function firstLine(text: string, max = 120): string {
  const line = (text.split(/\r?\n/).find(l => l.trim() !== '') ?? '').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

/** 1-based line of the first match of `needle` in `text`, or null. */
export function lineOf(text: string | null, needle: string | undefined): number | null {
  if (!text || !needle) return null
  const at = text.indexOf(needle)
  if (at < 0) return null
  let line = 1
  for (let k = 0; k < at; k++) if (text.charCodeAt(k) === 10) line++
  return line
}

function step(base: Omit<Step, 'add' | 'del' | 'diff' | 'status'>, oldText: string, newText: string): Step {
  const full = diffLines(oldText, newText)
  const { add, del } = countChanges(full)
  return { ...base, status: 'pending', add, del, diff: capDiff(full, MAX_STEP_LINES) }
}

/** Whether `path` sits under `root`; with no root known, everything counts as inside. */
export function isInside(root: string, path: string): boolean {
  return !root || relTo(root, path) !== normPath(path)
}

/**
 * The steps one edit call makes. `before` is the file's text before the call,
 * null when the file did not exist or could not be read. A file outside the
 * project makes none: the history is the project's.
 */
export function stepsFor(call: EditCall, before: string | null, root: string, at: number, idBase: string): Step[] {
  if (!EDIT_TOOLS.has(call.tool) || !call.file_path) return []
  const path = normPath(call.file_path)
  if (!isInside(root, path)) return []
  const rel = relTo(root, path)
  if (call.tool === 'Edit') {
    return [step({
      id: `${idBase}.0`, path, rel, tool: 'Edit', note: call.replace_all ? 'replace all' : '',
      line: lineOf(before, call.old_string), at,
    }, call.old_string ?? '', call.new_string ?? '')]
  }
  if (call.tool === 'MultiEdit') {
    const edits = call.edits ?? []
    return edits.map((ed, k) => step({
      id: `${idBase}.${k}`, path, rel, tool: 'MultiEdit', note: `edit ${k + 1} of ${edits.length}`,
      line: lineOf(before, ed.old_string), at,
    }, ed.old_string ?? '', ed.new_string ?? ''))
  }
  return [step({
    id: `${idBase}.0`, path, rel, tool: 'Write', note: before === null ? 'new file' : 'rewrite', line: null, at,
  }, before ?? '', call.content ?? '')]
}

/**
 * A deleted file as a step: its text, when a copy was kept, as removed lines (capped as
 * any step's diff is), so History shows what was in it. `text` null: no copy (binary,
 * too large, or gone before it could be read).
 */
export function deleteStep(path: string, root: string, text: string | null, by: DeletedBy, at: number, id: string): Step {
  const note = [by === 'you' ? 'deleted by you' : 'deleted', ...(text === null ? ['no copy kept'] : [])].join(' · ')
  return { ...step({ id, path: normPath(path), rel: relTo(root, normPath(path)), tool: 'Delete', note, line: null, at }, text ?? '', ''), status: 'ok' }
}

/** What `next(e)` of a tool call resolved to, as a step status. */
export function outcomeOf(result: unknown): StepStatus {
  if (!result || typeof result !== 'object') return 'ok'
  if ('deny' in result && typeof (result as { deny: unknown }).deny === 'string') return 'denied'
  if ((result as { isError?: unknown }).isError === true) return 'failed'
  return 'ok'
}

export function addTurn(turns: readonly Turn[], turn: Turn, max = MAX_TURNS): Turn[] {
  return [...turns.filter(t => t.id !== turn.id), turn].slice(-max)
}

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * Which other projects to drop from the store so that `key` at `bytes` fits
 * in `budget`, least recently used first. `fits` is false when it would not
 * fit even alone; the caller then trims its turns.
 */
export function planBudget(index: StoreIndex, key: string, bytes: number, budget = BUDGET_BYTES): { evict: string[]; fits: boolean } {
  const others = Object.entries(index).filter(([k]) => k !== key).sort((a, b) => a[1].used - b[1].used)
  let total = bytes + others.reduce((sum, [, v]) => sum + v.bytes, 0)
  const evict: string[] = []
  for (const [k, v] of others) {
    if (total <= budget) break
    evict.push(k)
    total -= v.bytes
  }
  return { evict, fits: bytes <= budget }
}

/** Drops the oldest turns until the JSON fits in `budget` bytes. */
export function trimTurnsToBytes(turns: readonly Turn[], budget: number): Turn[] {
  let kept = [...turns]
  while (kept.length && byteSize(kept) > budget) kept = kept.slice(1)
  return kept
}
