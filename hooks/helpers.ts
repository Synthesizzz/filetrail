// The helpers (subagents) of a session, for the Agents tab and the card's strip: who each is,
// what it was asked, how it stands, and which files it read or wrote. Built from what the
// engine says at a spawn, at a helper's own tool call and at its turn's end; no engine calls here.

import type { Helper, HelperFile } from '../types'

/** Helpers kept per session, and files kept per helper: the oldest go first. */
export const MAX_HELPERS = 50
export const MAX_HELPER_FILES = 30
/** Helpers the card's strip names; the rest are counted. */
export const STRIP_MAX = 2

/** What the engine's agent list says of a helper. */
export type ListedAgent = { id: string; type: string; description: string; status: string }

const lower = (s: string) => s.toLowerCase()

const fresh = (id: string, at: number, type = 'subagent', description = ''): Helper => ({
  id, type, description, state: 'running', startedAt: at, endedAt: null, calls: 0, files: [],
})

/** Keeps the newest MAX_HELPERS, dropping finished ones before any still running. */
function capped(list: Helper[]): Helper[] {
  let over = list.length - MAX_HELPERS
  if (over <= 0) return list
  return list.filter(h => (over > 0 && h.state !== 'running' ? (over--, false) : true)).slice(-MAX_HELPERS)
}

/** A helper the engine has just started: it joins, or a known one takes the type and task it was spawned with. */
export function joined(list: readonly Helper[], h: { id: string; type: string; description: string }, at: number): Helper[] {
  const known = list.find(x => x.id === h.id)
  if (known) return list.map(x => (x.id === h.id ? { ...x, type: h.type, description: h.description } : x))
  return capped([...list, fresh(h.id, at, h.type, h.description)])
}

/** A file added to a helper's files: a write outranks a read of the same file, and the oldest go past the cap. */
function withFile(files: readonly HelperFile[], file: HelperFile): HelperFile[] {
  const k = lower(file.path)
  const had = files.find(f => lower(f.path) === k)
  const tone = had?.tone === 'write' || file.tone === 'write' ? 'write' : 'read'
  return [...files.filter(f => lower(f.path) !== k), { path: had?.path ?? file.path, tone }].slice(-MAX_HELPER_FILES)
}

/** A tool a helper called, and the file it named when one: a helper not seen start joins as a plain subagent. */
export function called(list: readonly Helper[], id: string, at: number, file?: HelperFile | null): Helper[] {
  const base = list.some(x => x.id === id) ? list : capped([...list, fresh(id, at)])
  return base.map(x => (x.id === id ? { ...x, calls: x.calls + 1, files: file ? withFile(x.files, file) : x.files } : x))
}

/** A helper whose turn ended: done when it answered, failed otherwise. */
export function finished(list: readonly Helper[], id: string, at: number, ok: boolean): Helper[] {
  const base = list.some(x => x.id === id) ? list : capped([...list, fresh(id, at)])
  return base.map(x => (x.id === id ? { ...x, state: ok ? 'done' : 'failed', endedAt: at } : x))
}

/** A helper's next turn began (it was sent more to do): it works again; one not known, or already working, is left as it is. */
export function resumed(list: readonly Helper[], id: string): Helper[] {
  return list.map(x => (x.id === id && x.state !== 'running' ? { ...x, state: 'running', endedAt: null } : x))
}

const GONE = new Set(['completed', 'failed', 'killed'])

/**
 * The list set against the engine's own: a helper this module never saw (it started before a
 * reload) joins, and one still running here that the engine says is over is closed. What the
 * module counted itself (calls, files, times) is left as it is.
 */
export function reconciled(list: readonly Helper[], engine: readonly ListedAgent[], at: number): Helper[] {
  let out = [...list]
  for (const a of engine) {
    const stands = GONE.has(a.status) ? (a.status === 'completed' ? 'done' : 'failed') : 'running'
    const known = out.find(x => x.id === a.id)
    if (!known) {
      out = capped([...out, { ...fresh(a.id, at, a.type, a.description), state: stands, endedAt: stands === 'running' ? null : at }])
    } else if (known.state === 'running' && stands !== 'running') {
      out = out.map(x => (x.id === a.id ? { ...x, state: stands, endedAt: at } : x))
    }
  }
  return out
}

/** How long a helper has worked: to its end, or to `now` while it runs. */
export const elapsed = (h: Helper, now: number): number => Math.max(0, (h.endedAt ?? now) - h.startedAt)

/** Helpers at work. */
export const running = (list: readonly Helper[]): Helper[] => list.filter(h => h.state === 'running')

/** The card's strip: the running helpers it names (the newest first, STRIP_MAX of them) and how many more run. */
export function strip(list: readonly Helper[]): { shown: Helper[]; more: number } {
  const now = running(list).reverse()
  return { shown: now.slice(0, STRIP_MAX), more: Math.max(0, now.length - STRIP_MAX) }
}

/** A helper's one-line name: its type and the task, cut to `max`. */
export function nameOf(h: Helper, max = 40): string {
  const text = h.description ? `${h.type} · ${h.description}` : h.type
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
