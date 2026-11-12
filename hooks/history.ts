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

/**
 * Where each project's history sits in the store: last use and size; the folder as spelled and
 * its repo (git's common dir, absolute) once a save has written them; `heldBy` when another
 * folder shows this one's turns as brought, until it keeps or gives them back.
 */
export type IndexEntry = { used: number; bytes: number; root?: string; repo?: string; heldBy?: string }
export type StoreIndex = Record<string, IndexEntry>

/**
 * History brought from another folder, kept at `b:<path>` beside this folder's own key: the
 * origin's key and folder, when, and whether it was kept (moved here) or is still only shown.
 */
export type BringLink = { key: string; root: string; at: number; kept?: boolean }

/** The store key of the link a folder's History holds to another's. */
export function linkKey(key: string): string {
  return 'b:' + key.slice(2)
}

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

/**
 * Another folder whose history the store holds: its path (case-folded, as keyed), last use and
 * size; as a candidate to bring, also its key, its folder as spelled and whether it is this repo's.
 */
export type Elsewhere = { path: string; used: number; bytes: number; key?: string; root?: string; same?: boolean }

/**
 * The folders other than `key` that have history stored, most recently used first. History is
 * kept per folder, so a new worktree or a moved folder starts empty: this says it is not lost.
 */
export function elsewhereOf(index: StoreIndex, key: string): Elsewhere[] {
  return Object.entries(index)
    .filter(([k]) => k.startsWith('p:') && k !== key)
    .map(([k, v]) => ({ path: k.slice(2), used: v.used, bytes: v.bytes }))
    .sort((a, b) => b.used - a.used)
}

const WORKTREES = '/.claude/worktrees/'

/**
 * The folder a repo is checked out in, case-folded: its common dir without `/.git` when known,
 * else the path cut where a desktop worktree folder starts (`<repo>/.claude/worktrees/<name>`).
 */
export function mainOf(path: string, repo?: string): string {
  if (repo) return normPath(repo).replace(/\/+$/, '').replace(/\/\.git$/i, '').toLowerCase()
  const p = normPath(path).replace(/\/+$/, '').toLowerCase()
  const at = p.indexOf(WORKTREES)
  return at >= 0 ? p.slice(0, at) : p
}

/**
 * The folders whose History could be brought here, this repo's first, then by last use. An entry
 * with its repo written is this repo's when the repos match; an older one is guessed from its path:
 * the repo's folder, a folder under it, or one of its worktrees. Folders held by another are left out.
 */
export function bringCandidates(index: StoreIndex, key: string, here: { root: string; repo?: string }): Elsewhere[] {
  const main = mainOf(here.root, here.repo)
  const same = (k: string, v: IndexEntry) => {
    if (v.repo) return mainOf('', v.repo) === main
    const m = mainOf(k.slice(2))
    return m === main || m.startsWith(main + '/')
  }
  return Object.entries(index)
    .filter(([k, v]) => k.startsWith('p:') && k !== key && !v.heldBy)
    .map(([k, v]) => ({ path: k.slice(2), used: v.used, bytes: v.bytes, key: k, root: v.root ?? k.slice(2), same: same(k, v) }))
    .sort((a, b) => Number(b.same) - Number(a.same) || b.used - a.used)
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

/** A path as History names it: from the folder the session started in, or from the repo's top when it sits above that folder. */
export function relHere(root: string, bound: string, path: string): string {
  return isInside(root, path) ? relTo(root, path) : relTo(bound, path)
}

/**
 * The steps one edit call makes. `before` is the file's text before the call,
 * null when the file did not exist or could not be read. A file outside the
 * project (the repo's top, `bound`, or the folder when it is not a repo) makes none: the history is the project's.
 */
export function stepsFor(call: EditCall, before: string | null, root: string, at: number, idBase: string, bound = root): Step[] {
  if (!EDIT_TOOLS.has(call.tool) || !call.file_path) return []
  const path = normPath(call.file_path)
  if (!isInside(bound, path)) return []
  const rel = relHere(root, bound, path)
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
export function deleteStep(path: string, root: string, text: string | null, by: DeletedBy, at: number, id: string, bound = root): Step {
  const note = [by === 'you' ? 'deleted by you' : 'deleted', ...(text === null ? ['no copy kept'] : [])].join(' · ')
  return { ...step({ id, path: normPath(path), rel: relHere(root, bound, normPath(path)), tool: 'Delete', note, line: null, at }, text ?? '', ''), status: 'ok' }
}

/**
 * A file a shell command shrank or overwrote, as a step: the diff from the text before to the
 * text after, so the removed lines are a copy of the old text, capped as any step's diff is.
 */
export function changeStep(path: string, root: string, before: string, after: string, note: string, at: number, id: string, bound = root): Step {
  return { ...step({ id, path: normPath(path), rel: relHere(root, bound, normPath(path)), tool: 'Bash', note, line: null, at }, before, after), status: 'ok' }
}

/** What `next(e)` of a tool call resolved to, as a step status. */
export function outcomeOf(result: unknown): StepStatus {
  if (!result || typeof result !== 'object') return 'ok'
  if ('deny' in result && typeof (result as { deny: unknown }).deny === 'string') return 'denied'
  if ((result as { isError?: unknown }).isError === true) return 'failed'
  return 'ok'
}

/** Turns of blocked calls alone kept per project, apart from the MAX_TURNS of edits: they never push an edit turn out. */
export const MAX_BLOCKED_ONLY = 10

const blockedOnly = (t: Turn) => !t.steps.length && !!t.blocked?.length

export function addTurn(turns: readonly Turn[], turn: Turn, max = MAX_TURNS): Turn[] {
  const all = [...turns.filter(t => t.id !== turn.id), turn]
  const onlyKept = new Set(all.filter(blockedOnly).slice(-MAX_BLOCKED_ONLY))
  const kept = all.filter(t => !blockedOnly(t) || onlyKept.has(t))
  let over = kept.filter(t => !blockedOnly(t)).length - max
  return kept.filter(t => (over > 0 && !blockedOnly(t) ? (over--, false) : true))
}

/**
 * Two folders' turns as one History, oldest first, by `addTurn`'s rules: the newest MAX_TURNS
 * edit turns and MAX_BLOCKED_ONLY blocked-only ones; a turn whose id is in both is kept once.
 */
export function mergeTurns(a: readonly Turn[], b: readonly Turn[], max = MAX_TURNS): Turn[] {
  let kept: Turn[] = []
  for (const t of [...a, ...b].sort((x, y) => x.at - y.at)) kept = addTurn(kept, t, max)
  return kept
}

/**
 * Keeping brought turns: the origin's turns, each marked `from`, join this folder's own; what the
 * budget of turns leaves out stays with the origin, unmarked, so nothing is lost.
 */
export function keepSplit(own: readonly Turn[], origin: readonly Turn[], from: string): { kept: Turn[]; left: Turn[] } {
  const kept = mergeTurns(own, origin.map(t => ({ ...t, from })))
  const ids = new Set(kept.map(t => t.id))
  return { kept, left: origin.filter(t => !ids.has(t.id)) }
}

/** Giving kept turns back: this folder's turns from `from` (any case) leave, without the mark; the rest stay. */
export function unbringSplit(own: readonly Turn[], from: string): { stay: Turn[]; back: Turn[] } {
  const f = normPath(from).replace(/\/+$/, '').toLowerCase()
  const mine = (t: Turn) => !!t.from && normPath(t.from).replace(/\/+$/, '').toLowerCase() === f
  return {
    stay: own.filter(t => !mine(t)),
    back: own.filter(mine).map(({ from: _from, ...t }) => t),
  }
}

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * Which other projects to drop from the store so that `key` at `bytes` fits
 * in `budget`, least recently used first. `fits` is false when it would not
 * fit even alone; the caller then trims its turns. A folder held by another is dropped only
 * after every other one.
 */
export function planBudget(index: StoreIndex, key: string, bytes: number, budget = BUDGET_BYTES): { evict: string[]; fits: boolean } {
  // A folder another one shows as brought goes last: its turns are on show there.
  const others = Object.entries(index).filter(([k]) => k !== key)
    .sort((a, b) => Number(!!a[1].heldBy) - Number(!!b[1].heldBy) || a[1].used - b[1].used)
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
