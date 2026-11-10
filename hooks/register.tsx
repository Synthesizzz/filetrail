// filetrail: a file tree and a history of Claude's edits in one pane.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DeletedBy, Entry, FilesView, TreeMode, GitActionEntry, GitInfo, Helper, Hint, Stage, HistoryView, Preview, SearchIndex, StaleMark, Step, StepStatus, Tab, TestRuns, Tone, TouchedFile, Turn } from '../types'
import { BROWSE_MS, FLASH_MS, HOLD_MS, foldersTo, targetOf } from './activity'
import type { Target } from './activity'
import { hintFor, hintRow } from './band'
import { agentsView, tabLabel } from './agents-view'
import { called, finished, joined, reconciled, resumed, running } from './helpers'
import { commandKind, deleteTargets, isCommit, readTargets, shortCommand } from './bash'
import { blockedOf, callText } from './blocked'
import { judge, MAX_WATCH_CHARS, namedFiles, snapshot } from './shell-change'
import type { Snapshot } from './shell-change'
import { dimensionsOf, imageKind, imageSvg, MAX_DRAW_BYTES } from './image'
import type { ImageKind } from './image'
import { checksum, judgeStale, remember, staleLabel } from './stale'
import type { ReadRecord } from './stale'
import { addRun, dismissRuns, testCommand, testScope } from './test-runs'
import { contextLine, mentionedPaths, resolveMention } from './context'
import { fullCopy, openCommand, osOf, relativeCopy, revealCommand } from './open'
import type { HostOs } from './open'
import { askText, fileStamp, historyMarkdown, projectName, stamp } from './export'
import { filesView, TOUCHED_MAX } from './files-view'
import { clearRows, rowCopies, rowOpens, rowPresses, rowReveals, toolPresses } from './presses'
import { parseNumstat, parseStatus } from './git'
import { gitActionsOf, makesRepo, MAX_ACTIONS } from './git-actions'
import { NO_SVG } from './octicons'
import { isMarkdown, pageOf, pageText, PAGE_LINES, refusal } from './preview'
import {
  addTurn, byteSize, BUDGET_BYTES, changeStep, deleteStep, EDIT_TOOLS, firstLine, INDEX_KEY, MAX_TURNS, normPath, outcomeOf, planBudget,
  isInside, projectKey, relTo, stepsFor, trimTurnsToBytes,
} from './history'
import type { EditCall, StoreIndex } from './history'
import { historyView, TIMELINE } from './history-view'
import { MAX_INDEX_FILES, parseLsFiles, SKIP_DIRS } from './search'
import { joinPath, lower, parentOf, toEntries } from './tree'

export const PANE = 'filetrail'

const tab = atom({ plugin: 'filetrail', key: 'tab' } as const, 'files' as Tab)
const history = atom({ plugin: 'filetrail', key: 'history' } as const, [] as Turn[])
const view = atom({ plugin: 'filetrail', key: 'view' } as const, TIMELINE as HistoryView)
const listing = atom({ plugin: 'filetrail', key: 'listing' } as const, {} as Record<string, Entry[]>)
const git = atom({ plugin: 'filetrail', key: 'git' } as const, null as GitInfo | null)
const files = atom({ plugin: 'filetrail', key: 'files' } as const, { expanded: [], selected: null } as FilesView)
const flash = atom({ plugin: 'filetrail', key: 'flash' } as const, {} as Record<string, Tone>)
const last = atom({ plugin: 'filetrail', key: 'last' } as const, null as { path: string; tone: Tone; at?: number } | null)
const hint = atom({ plugin: 'filetrail', key: 'hint' } as const, null as Hint | null)
const live = atom({ plugin: 'filetrail', key: 'live' } as const, null as Turn | null)
const index = atom({ plugin: 'filetrail', key: 'index' } as const, null as SearchIndex | null)
const gitLog = atom({ plugin: 'filetrail', key: 'actions' } as const, [] as GitActionEntry[])
const stage = atom({ plugin: 'filetrail', key: 'stage' } as const, null as Stage | null)
const working = atom({ plugin: 'filetrail', key: 'working' } as const, false)
const turnFiles = atom({ plugin: 'filetrail', key: 'turnFiles' } as const, [] as string[])
/** The tree's view, kept for the next session. */
const MODE_KEY = 'filetrail:treeMode'
/** The touched files the card shows, as its handle left it, kept for the next session. */
const ROWS_KEY = 'filetrail:touchedRows'
/** This turn's files kept at most, for the Now tree. */
const MAX_TURN_FILES = 100
const preview = atom({ plugin: 'filetrail', key: 'preview' } as const, null as Preview | null)
const touched = atom({ plugin: 'filetrail', key: 'touched' } as const, [] as TouchedFile[])
/** The files of the history git ignores (lower-cased): History leaves them out. */
const ignored = atom({ plugin: 'filetrail', key: 'ignored' } as const, [] as string[])
const tests = atom({ plugin: 'filetrail', key: 'tests' } as const, null as TestRuns | null)
const stale = atom({ plugin: 'filetrail', key: 'stale' } as const, {} as Record<string, StaleMark>)
/** The session's helpers (subagents), for the Agents tab and the card's strip. (`helpers` below counts those at work, for the crab.) */
const crew = atom({ plugin: 'filetrail', key: 'helpers' } as const, [] as Helper[])
/** The helpers whose rows are open to their files in the Agents tab (ids); a press on a row's task opens or closes it. */
const agentsOpen = atom({ plugin: 'filetrail', key: 'helpersOpen' } as const, [] as string[])
/** Whether the pane was turned to the Agents tab for this turn already: the first helper of a turn does it, the rest leave the tab where the person put it. */
let agentsShown = false
/** Kept in the session's state, so a reload starts from the head measured before. */
/** Files the Claude touched list keeps. */
const MAX_TOUCHED = TOUCHED_MAX
// One build at a time: typing fast must not start a listing per key.
let indexing: Promise<void> | null = null

/**
 * Lists every file of the project for the search box: git's list in a repo (tracked and
 * untracked, ignored files left out), else a walk of the folders without .git and
 * node_modules, cut at MAX_INDEX_FILES.
 */
async function buildIndex($: EngineInterface): Promise<void> {
  const fromGit = await $.process.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, timeoutMs: 15_000 })
    .catch(() => null)
  if (fromGit && fromGit.exitCode === 0) {
    const listed = parseLsFiles(fromGit.stdout)
    await update($, index, () => ({ files: listed.slice(0, MAX_INDEX_FILES * 20), complete: !fromGit.isStdoutTruncated }))
    return
  }
  const found: string[] = []
  const queue: string[] = ['']
  let complete = true
  while (queue.length) {
    const rel = queue.shift()!
    let entries: { name: string; kind: string }[] = []
    try { entries = await $.fs.list(rel ? joinPath(root, rel) : root) } catch { continue }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.kind === 'dir') { if (!SKIP_DIRS.has(entry.name)) queue.push(child) }
      else found.push(child)
    }
    if (found.length >= MAX_INDEX_FILES) { complete = false; break }
  }
  await update($, index, () => ({ files: found.slice(0, MAX_INDEX_FILES), complete }))
}

function ensureIndex($: EngineInterface): Promise<void> {
  indexing ??= buildIndex($).finally(() => { indexing = null })
  return indexing
}

/** The saved turns, and the running one after them while it has edits and is not saved yet. */
function withLive(turns: readonly Turn[], now: Turn | null): readonly Turn[] {
  return now && !turns.some(t => t.id === now.id) ? [...turns, now] : turns
}

// The project whose history this session records: the cwd at session start.
let root = ''
// The main-loop turn running now; its steps reach the store when it completes.
let pending: Turn | null = null
let callCount = 0
/** Keeps two git actions started in the same millisecond apart. */
let gitCount = 0
// Outside a repo git is asked once per load, not after every edit.
let isRepo: boolean | null = null
let gitTimer: { cancel: () => void } | null = null
// Which system opens files, worked out once per load.
let hostOs: HostOs | null = null

async function osHere($: EngineInterface): Promise<HostOs> {
  if (hostOs) return hostOs
  let uname = ''
  if (!/^[A-Za-z]:[\\/]/.test(root)) uname = (await $.process.run(['uname', '-s']).catch(() => null))?.stdout ?? ''
  hostOs = osOf(root, uname)
  return hostOs
}

/** Opens a file with its default app and says so; a failure says why. */
async function openFile($: EngineInterface, path: string) {
  const ran = await $.process.run(openCommand(await osHere($), path), { timeoutMs: 10_000 })
  $.ui.toast(ran.exitCode === 0 ? `filetrail: opened ${relTo(root, path)}` : `filetrail: could not open ${relTo(root, path)}: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`)
}

/**
 * Shows a file selected in its folder in the system's file manager, or opens a folder; says so.
 * A file that is gone shows its folder (explorer opens Documents for a path it cannot find).
 * explorer ends with 1 when it worked, so on Windows that, with nothing on stderr, is no failure.
 */
async function showInFolder($: EngineInterface, path: string, isDir: boolean) {
  const os = await osHere($)
  const gone = !isDir && !(await $.fs.exists(path))
  const ran = await $.process.run(revealCommand(os, gone ? parentOf(path) : path, isDir || gone), { timeoutMs: 10_000 })
  const rel = relTo(root, path)
  const worked = ran.exitCode === 0 || (os === 'windows' && ran.exitCode === 1 && !ran.stderr.trim())
  $.ui.toast(!worked
    ? `filetrail: could not show ${rel}: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`
    : isDir ? `filetrail: opened folder ${rel}` : gone ? `filetrail: ${rel} is gone, showed its folder` : `filetrail: showed ${rel} in its folder`)
}

async function copyPath($: EngineInterface, path: string, full: boolean, surface: string) {
  const text = full ? fullCopy(await osHere($), path) : relativeCopy(root, path)
  const done = await $.ui.copy({ text, surface: surface as 'desktop' })
  $.ui.toast(done.isCopied ? `filetrail: copied ${text.replace(/\\/g, '/')}` : `filetrail: could not copy: ${done.reason}`)
}
const flashTimers = new Map<string, { cancel: () => void }>()

/** Runs a button's work without awaiting it; a failure goes to the transcript, never unhandled. */
function fire($: EngineInterface, what: string, work: () => Promise<unknown>) {
  void work().catch(err => {
    try { $.ui.log(`filetrail: ${what} failed: ${String(err)}`) } catch { /* unloading */ }
  })
}

/**
 * Folders the person opened or closed lately, with when: the follow leaves them, and
 * the folders above them, as they are for BROWSE_MS. Every other open folder that does
 * not lead to Claude's file folds, so the tree shows where Claude is and not every
 * folder it or the person passed through.
 */
const browsed = new Map<string, number>()

/**
 * Opens the folders down to `path` (listing those not listed yet); `select` also selects it. Paths outside the root are left alone.
 * `follow` (Claude touched it): open folders that do not lead to `path` fold, but for
 * those the person browsed lately; asked by the person, the folders opened count as browsed.
 */
async function reveal($: EngineInterface, path: string, select: boolean, follow = false) {
  const dirs = foldersTo(root, path)
  if (!dirs) return
  const listed = await read($, listing)
  for (const d of dirs) if (!(lower(d) in listed)) await listDir($, d)
  const want = dirs.map(lower)
  const open = new Set((await read($, files)).expanded)
  const now = await $.clock.now()
  if (follow) {
    const keep = new Set(want)
    for (const [d, at] of [...browsed]) {
      if (now - at > BROWSE_MS) { browsed.delete(d); continue }
      keep.add(d)
      for (const o of open) if (d.startsWith(o + '/')) keep.add(o)
    }
    for (const d of [...open]) if (!keep.has(d)) open.delete(d)
  } else for (const d of want) browsed.set(d, now)
  for (const d of want) open.add(d)
  await update($, files, f => ({ ...f, expanded: [...open], selected: select ? path : f.selected }))
}

/*
 * The whole tree is drawn under the card, and the pane scrolls like a page when it is
 * long, left where the person puts it. The tree is not moved to Claude's file: on the
 * desktop the pane's window is the desktop's, and a mod can put it only at its start or
 * end (seen in traces). It once drew only the rows that fit under the card, moved by a
 * glide and ▲ ▼ buttons, which left a short tree when the card was tall (seen live).
 */


/**
 * Lights the row Claude touched and, for one file, opens the tree to it: a file Claude
 * reads or edits stays lit while it is on it, a searched folder or a commit for FLASH_MS.
 * Awaited by the tool.call hook: work a hook leaves running when it returns can be cut off
 * with its dispatch (seen live: the flash never showed, and no failure line either).
 * The fade and the scroll run on timers, which outlive the dispatch.
 */
async function touch($: EngineInterface, target: Target) {
  const k = lower(target.path)
  // One file is Claude's at a time: the one it leaves goes out as this one lights.
  if (target.follow) {
    if (onFile && onFile !== k) await unlight($, onFile)
    onFile = k
  }
  const at = await $.clock.now()
  await update($, flash, f => ({ ...f, [k]: target.tone }))
  await update($, last, () => ({ path: k, tone: target.tone, at }))
  // A file read, written, committed or deleted joins the Claude touched list (a searched folder does not).
  if (target.follow || target.tone === 'commit' || target.tone === 'delete' || target.flag) {
    const entry: TouchedFile = { path: normPath(target.path), tone: target.tone, at, ...(target.by ? { by: target.by } : {}), ...(target.flag ? { flag: target.flag } : {}) }
    await update($, touched, list => [entry, ...list.filter(f => lower(f.path) !== k)].slice(0, MAX_TOUCHED))
    // The Now tree: this turn's files, the newest last.
    await update($, turnFiles, list => [...list.filter(p => lower(p) !== k), normPath(target.path)].slice(-MAX_TURN_FILES))
  }
  flashTimers.get(k)?.cancel()
  flashTimers.set(k, $.clock.after(target.follow ? HOLD_MS : FLASH_MS, () => {
    // The module may be unloading when this fires; nothing to clean up then.
    void unlight($, k).catch(() => undefined)
  }))
  if (target.follow) await reveal($, target.path, false, true)
}

/** The file Claude is on (lower-cased), lit until it moves on or the turn ends. */
let onFile: string | null = null

/** Puts out one row's light and its fade timer. */
async function unlight($: EngineInterface, k: string) {
  flashTimers.get(k)?.cancel()
  flashTimers.delete(k)
  if (onFile === k) onFile = null
  await update($, flash, f => Object.fromEntries(Object.entries(f).filter(([p]) => p !== k)))
}

/** Paths of one Bash command lit at most: a wide `cat a b c …` should not light the whole tree. */
const MAX_BASH_TARGETS = 12

/**
 * Lights what a Bash command is about to read: files a reader names (the first one
 * followed into view) and the folders or files a search or listing names (lit only).
 * Only paths inside the project that exist are touched.
 */
async function lightReads($: EngineInterface, command: string): Promise<string[]> {
  let followed = false
  const readers: string[] = []
  for (const t of readTargets(command, root).slice(0, MAX_BASH_TARGETS)) {
    if (!isInside(root, t.path) || !(await $.fs.exists(t.path))) continue
    await touch($, { path: t.path, tone: 'read', follow: t.follow && !followed })
    if (t.follow) {
      followed = true
      readers.push(t.path)
    }
  }
  // The files a reader named: noted once the command went through, not before.
  return readers
}

/** Files of one delete recorded at most, with the text of each kept: a wide `rm -r` should not fill the history. */
const MAX_DELETE_FILES = 50
/** Deletions the refresh finds this soon after a turn ended were Claude's (a command not read as a delete). */
const AFTER_TURN_MS = 5000
/** Paths (lower-cased) recorded as deleted, so the listing and git do not record them again; a path seen again leaves. */
const gone = new Set<string>()
/** When the last main-loop turn ended, and that turn (its steps saved, or none). */
let turnEndedAt = -Infinity
let lastTurn: Turn | null = null
let deleteCount = 0

type Doomed = { path: string; text: string | null }

/** A file's text to keep once it is deleted; null for a binary or large one, or one that cannot be read. */
async function copyOf($: EngineInterface, path: string): Promise<string | null> {
  try {
    const text = String(await $.fs.read(path))
    return refusal(text) ? null : text
  } catch {
    return null
  }
}

/** The files at `path`: itself, or the files under it when it is a folder, MAX_DELETE_FILES at most. */
async function filesAt($: EngineInterface, path: string, out: string[] = []): Promise<string[]> {
  let listed: Entry[]
  try { listed = toEntries(path, await $.fs.list(path)).entries } catch { out.push(normPath(path)); return out }
  for (const e of listed) {
    if (out.length >= MAX_DELETE_FILES) break
    if (e.kind === 'dir') await filesAt($, e.path, out)
    else out.push(e.path)
  }
  return out
}

/** What a Bash command is about to delete in the project, with the text of each file, read before it goes. */
async function doomedBy($: EngineInterface, command: string): Promise<Doomed[]> {
  const out: Doomed[] = []
  for (const p of deleteTargets(command, root)) {
    if (!isInside(root, p) || !(await $.fs.exists(p))) continue
    for (const f of await filesAt($, p)) {
      if (out.length >= MAX_DELETE_FILES) return out
      out.push({ path: f, text: await copyOf($, f) })
    }
  }
  return out
}

type Watch = { path: string; truncates: boolean; before: Snapshot }

/**
 * The files a shell command names, as they stand before it runs: their size and headings
 * and their text, for the comparison after. A file that is not there, is binary, is too long
 * or cannot be read is left out: the command still runs, unwatched.
 */
async function watchBefore($: EngineInterface, command: string): Promise<Watch[]> {
  const out: Watch[] = []
  for (const w of namedFiles(command, root)) {
    try {
      if (!(await $.fs.exists(w.path))) continue
      const text = String(await $.fs.read(w.path))
      if (text.length > MAX_WATCH_CHARS || refusal(text)) continue
      out.push({ ...w, before: snapshot(text, isMarkdown(w.path)) })
    } catch { /* not watched */ }
  }
  return out
}

/**
 * After a shell command: the watched files it shrank or overwrote become steps in the
 * running turn (the old text kept as removed lines, capped) and rows in the touched list
 * with their flag. A file the command deleted is the deletion record's, not this one's.
 */
async function recordShellChanges($: EngineInterface, watched: readonly Watch[], skip: ReadonlySet<string>) {
  const found: { w: Watch; text: string; flag: string; note: string }[] = []
  for (const w of watched) {
    if (skip.has(lower(w.path))) continue
    let text: string
    try {
      if (!(await $.fs.exists(w.path))) continue
      text = String(await $.fs.read(w.path))
    } catch { continue }
    const flagged = judge(w.before, snapshot(text, isMarkdown(w.path)), w.truncates)
    if (flagged) found.push({ w, text, ...flagged })
  }
  if (!found.length) return
  const at = await $.clock.now()
  pending ??= { id: `t${at}`, at, prompt: '', steps: [] }
  const base = pending.id
  pending.steps.push(...found.map(f => changeStep(f.w.path, root, f.w.before.text, f.text, f.note, at, `${base}.${callCount++}`)))
  await showLive($)
  for (const f of found) await touch($, { path: f.w.path, tone: 'write', follow: false, flag: f.flag })
}

/**
 * Keeps a call that was refused or failed in the running turn, with who stopped it and why.
 * Every tool's call counts, an edit's too (its step also says it was not applied).
 */
async function recordBlocked($: EngineInterface, call: unknown, result: unknown) {
  const found = blockedOf(result)
  if (!found) return
  const at = await $.clock.now()
  pending ??= { id: `t${at}`, at, prompt: '', steps: [] }
  const tool = String((call as { tool?: unknown }).tool ?? '')
  const entry = { id: `${pending.id}.b${callCount++}`, tool, call: callText(call as { tool: string }), reason: found.reason, kind: found.kind, at }
  pending.blocked = [...(pending.blocked ?? []), entry]
  await showLive($)
}

/** Files Claude read this session, as they were then: what a later change is measured against. */
const reads = new Map<string, ReadRecord>()

/** git's HEAD, or null outside a repo or when git does not answer. */
async function headSha($: EngineInterface, fresh = false): Promise<string | null> {
  if (isRepo === false) return null
  if (!fresh && headCache !== undefined) return headCache
  const ran = await $.process.run(['git', 'rev-parse', 'HEAD'], { cwd: root, timeoutMs: 5000 }).catch(() => null)
  headCache = ran && ran.exitCode === 0 ? ran.stdout.trim() || null : null
  return headCache
}

/** HEAD as last asked (undefined: not yet this turn): the reads of one turn share one question to git. */
let headCache: string | null | undefined

/** A checksum of a file's text now; null when it is gone, binary, too long or unreadable. */
async function sumOf($: EngineInterface, path: string): Promise<string | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    const text = String(await $.fs.read(path))
    return text.length > MAX_WATCH_CHARS || refusal(text) ? null : checksum(text)
  } catch {
    return null
  }
}

/** Remembers a file of the project as Claude reads it now, and takes any marker off it: what Claude knows is current. */
async function noteRead($: EngineInterface, path: string) {
  if (!isInside(root, path)) return
  const k = lower(path)
  const sum = await sumOf($, path)
  if (sum === null) return
  remember(reads, k, { path: normPath(path), at: await $.clock.now(), sum, head: await headSha($) })
  if (k in (await read($, stale))) await update($, stale, m => Object.fromEntries(Object.entries(m).filter(([p]) => p !== k)))
}

/** The files (lower-cased, relative to the project) that differ between a HEAD a file was read at and HEAD now; null when git cannot say. */
async function changedSince($: EngineInterface, from: string): Promise<Set<string> | null> {
  const ran = await $.process.run(['git', 'diff', '--name-only', '--relative', `${from}..HEAD`], { cwd: root, timeoutMs: 10_000 }).catch(() => null)
  if (!ran || ran.exitCode !== 0) return null
  return new Set(ran.stdout.split(/\r?\n/).filter(Boolean).map(lower))
}

/**
 * Looks again at every file Claude read: changed on the disk or held by a commit since. Claude's
 * own edits (from the steps filetrail recorded) are told apart from a change outside, not marked.
 * The marks are replaced by what it finds.
 */
async function refreshStale($: EngineInterface) {
  if (!reads.size) return
  const head = await headSha($, true)
  // One question to git for each HEAD the files were read at, not one for each file.
  const held = new Map<string, Set<string> | null>()
  const steps = [...(await read($, history)).flatMap(t => t.steps), ...(pending?.steps ?? [])]
  const at = await $.clock.now()
  const marks: Record<string, StaleMark> = {}
  for (const [k, rec] of reads) {
    const edited = steps.some(s => lower(s.path) === k && s.at >= rec.at && s.status !== 'denied' && s.status !== 'failed' && (EDIT_TOOLS.has(s.tool) || s.tool === 'Bash'))
    let committed = false
    if (rec.head && head && rec.head !== head) {
      if (!held.has(rec.head)) held.set(rec.head, await changedSince($, rec.head))
      committed = held.get(rec.head)?.has(lower(relTo(root, rec.path))) ?? false
    }
    const by = judgeStale(rec, { sum: await sumOf($, rec.path) }, edited, committed)
    if (by) marks[k] = { by, at }
  }
  await update($, stale, () => marks)
}

/** Keeps a finished test command as the session's last run (one a hook or Claude Code refused never ran). */
async function recordTestRun($: EngineInterface, command: string, started: number, result: unknown) {
  const outcome = outcomeOf(result)
  // A refusal (a deny, or an error saying a hook or Claude Code stopped it) is not a run.
  const stopped = blockedOf(result)?.kind
  if (outcome === 'denied' || stopped === 'hook' || stopped === 'harness' || commandKind(command) !== 'test') return
  const at = await $.clock.now()
  const run = { command: shortCommand(testCommand(command)), ok: outcome === 'ok', at, ms: at - started, scope: testScope(command) }
  await update($, tests, runs => addRun(runs, run))
}

/** Takes the paths not yet recorded as deleted and marks them so, before any await: two finders never record one twice. */
function claim<T extends { path: string }>(items: readonly T[]): T[] {
  const mine = items.filter(i => !gone.has(lower(i.path)))
  for (const i of mine) gone.add(lower(i.path))
  return mine
}

/**
 * Records deleted files: a step each in History, their text kept as removed lines, and
 * a row in the card's touched list saying who deleted them. Claude's go in the running
 * turn (or the one that just ended); the person's in a turn of their own.
 */
async function recordDeleted($: EngineInterface, items: readonly Doomed[], by: DeletedBy) {
  if (!items.length) return
  const at = await $.clock.now()
  const steps = items.map((i, k) => deleteStep(i.path, root, i.text, by, at, `d${at}.${deleteCount++}.${k}`))
  if (by === 'claude' && pending) {
    pending.steps.push(...steps)
    await showLive($)
  } else if (by === 'claude' && lastTurn && at - turnEndedAt < AFTER_TURN_MS) {
    lastTurn = { ...lastTurn, steps: [...lastTurn.steps, ...steps] }
    await saveTurn($, lastTurn)
  } else {
    await saveTurn($, { id: `d${at}`, at, prompt: by === 'you' ? 'Deleted outside Claude' : 'Deleted', steps })
  }
  for (const i of items) await touch($, { path: i.path, tone: 'delete', follow: false, by })
}

/** Who deleted files found gone by a refresh: Claude while its turn runs or just after, the person otherwise. */
async function deleterNow($: EngineInterface): Promise<DeletedBy> {
  return pending || (await $.clock.now()) - turnEndedAt < AFTER_TURN_MS ? 'claude' : 'you'
}

/**
 * Records files found gone by a refresh (the listing, git): their text from git's HEAD
 * when tracked, as they are already gone from the disk. A path still there is let be.
 */
async function recordFoundGone($: EngineInterface, paths: readonly string[]) {
  const mine = claim(paths.map(path => ({ path })))
  const items: Doomed[] = []
  for (const { path } of mine) {
    if (await $.fs.exists(path)) { gone.delete(lower(path)); continue }
    items.push({ path, text: await headCopy($, path) })
  }
  await recordDeleted($, items, await deleterNow($))
}

/** A tracked file's text at HEAD, for a file deleted outside a command Claude ran; null when untracked. */
async function headCopy($: EngineInterface, path: string): Promise<string | null> {
  if (!isRepo || !isInside(root, path)) return null
  const shown = await $.process.run(['git', 'show', `HEAD:./${relTo(root, path)}`], { cwd: root, timeoutMs: 10_000 })
  if (shown.exitCode !== 0) return null
  return refusal(shown.stdout) ? null : shown.stdout
}

/** After a commit went through, lights the files it holds in the commit's green. */
async function lightCommit($: EngineInterface) {
  const shown = await $.process.run(['git', 'show', '--name-only', '--format=', '--relative', 'HEAD'], { cwd: root, timeoutMs: 10_000 })
  if (shown.exitCode !== 0) return
  for (const rel of shown.stdout.split(/\r?\n/).filter(Boolean).slice(0, 20)) {
    await touch($, { path: joinPath(root, rel), tone: 'commit', follow: false })
  }
}

async function listDir($: EngineInterface, dir: string) {
  let entries: Entry[] = []
  let listedOk = false
  let more = 0
  try {
    const listed = toEntries(dir, await $.fs.list(dir))
    entries = listed.entries
    more = listed.more
    listedOk = true
    if (listed.more) $.ui.log(`filetrail: ${dir} shows ${entries.length} entries; ${listed.more} more are left out`)
  } catch (err) {
    $.ui.log(`filetrail: could not list ${dir}: ${String(err)}`)
  }
  const before = (await read($, listing))[lower(dir)]
  await update($, listing, l => ({ ...l, [lower(dir)]: entries }))
  // A file the last listing had and this one has not was deleted, by Claude or the person.
  // Not when the listing failed or was cut short (rows missing for no deletion), nor when
  // another file came in the same folder at once: that is likely a rename, not a delete.
  if (!before || !listedOk || more) return
  for (const e of entries) gone.delete(lower(e.path))
  const now = new Set(entries.map(e => lower(e.path)))
  const was = new Set(before.map(e => lower(e.path)))
  const vanished = before.filter(e => e.kind === 'file' && !now.has(lower(e.path)))
  if (vanished.length && !entries.some(e => !was.has(lower(e.path)))) {
    await recordFoundGone($, vanished.map(e => e.path)).catch(err => $.ui.log(`filetrail: a deletion was not recorded: ${String(err)}`))
  }
}

/**
 * Lists again the root and every open folder that was listed before, and
 * forgets closed ones (they list again when opened). The old rows stay on
 * show until each new listing lands.
 */
async function relist($: EngineInterface) {
  const open = new Set((await read($, files)).expanded)
  const listed = Object.keys(await read($, listing))
  // Shallowest first, so each folder's own spelling is in its parent's fresh listing:
  // the keys are lower-cased, and listing by a key gave every row a lower-cased path
  // (seen live: the selected file's full path came out all lower case).
  const dirs = listed.filter(d => d === lower(root) || open.has(d)).sort((a, b) => a.length - b.length)
  for (const d of dirs) {
    const now = await read($, listing)
    const spelled = d === lower(root) ? root : Object.values(now).flat().find(e => e.kind === 'dir' && lower(e.path) === d)?.path ?? d
    await listDir($, spelled)
  }
  await update($, listing, l => Object.fromEntries(Object.entries(l).filter(([d]) => dirs.includes(d))))
}

async function refreshGit($: EngineInterface) {
  if (isRepo === false) return
  const opts = { cwd: root, timeoutMs: 10_000 }
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], opts)
  isRepo = top.exitCode === 0
  if (!isRepo) {
    await update($, git, () => null)
    return
  }
  const status = await $.process.run(['git', 'status', '--porcelain=v1', '-b', '-z'], opts)
  // HEAD is missing before the first commit: no line counts then.
  const numstat = await $.process.run(['git', 'diff', '--numstat', 'HEAD'], opts)
  const info: GitInfo = {
    top: normPath(top.stdout.trim()),
    ...parseStatus(status.exitCode === 0 ? status.stdout : ''),
    numstat: numstat.exitCode === 0 ? parseNumstat(numstat.stdout) : {},
  }
  const prev = await read($, git)
  await update($, git, () => info)
  // A tracked file newly deleted since the last read was deleted by Claude or the person; it
  // may sit in a closed folder the listing does not watch. Not on the first read: what was
  // deleted before the session is not this session's. git spells the paths for HEAD.
  if (prev && status.exitCode === 0) {
    const fresh = Object.entries(info.status).filter(([rel, code]) => code === 'D' && prev.status[rel] !== 'D').map(([rel]) => rel)
    if (fresh.length) {
      const listed = await $.process.run(['git', 'ls-files', '--deleted', '-z', '--full-name'], opts)
      const spelled = listed.exitCode === 0 ? listed.stdout.split('\0').filter(Boolean) : []
      const paths = spelled.filter(rel => fresh.includes(lower(rel))).map(rel => joinPath(info.top, rel)).filter(p => isInside(root, p))
      await recordFoundGone($, paths).catch(err => $.ui.log(`filetrail: a deletion was not recorded: ${String(err)}`))
    }
  }
  await refreshIgnored($)
}

/**
 * Asks git which files of the history it ignores (a notes file kept out of the repo, a
 * build output), for History to leave out. Only the history's own paths are asked, on
 * stdin; a tracked file is never reported, git's rules being for untracked ones.
 */
async function refreshIgnored($: EngineInterface) {
  const paths = [...new Set((await read($, history)).flatMap(t => t.steps.map(s => s.path)))].filter(p => isInside(root, p))
  if (!paths.length) return
  const rels = paths.map(p => relTo(root, p))
  const asked = await $.process.run(['git', 'check-ignore', '--stdin'], { cwd: root, timeoutMs: 10_000, stdin: rels.join('\n') + '\n' })
  // 0: some are ignored, 1: none is; anything else is git failing, and leaves the list as it was.
  if (asked.exitCode !== 0 && asked.exitCode !== 1) return
  const out = asked.exitCode === 0 ? asked.stdout.split(/\r?\n/).filter(Boolean).map(rel => lower(joinPath(root, rel))) : []
  await update($, ignored, () => out)
}

/** Git is read again once edits settle, not on every one. */
function scheduleGit($: EngineInterface) {
  gitTimer?.cancel()
  gitTimer = $.clock.after(600, () => void refreshGit($).catch(err => $.ui.log(`filetrail: git status failed: ${String(err)}`)))
}

async function loadHistory($: EngineInterface) {
  try { root = await $.session.cwd() } catch { root = '' }
  const saved = await $.store.get(projectKey(root))
  await update($, history, () => (Array.isArray(saved) ? (saved as Turn[]) : []))
}

/** Shows the running turn as it stands: a copy, since its steps change as the tools answer. */
async function showLive($: EngineInterface) {
  const now = pending
  if (!now || (!now.steps.length && !now.blocked?.length)) return
  await update($, live, () => ({ ...now, steps: now.steps.map(s => ({ ...s })), ...(now.blocked ? { blocked: now.blocked.map(b => ({ ...b })) } : {}) }))
}

/** Adds a finished turn to the project's history and keeps every project inside the store's budget. */
async function saveTurn($: EngineInterface, turn: Turn) {
  const key = projectKey(root)
  let turns = addTurn(await read($, history), turn, MAX_TURNS)
  const index = ((await $.store.get(INDEX_KEY)) ?? {}) as StoreIndex
  const plan = planBudget(index, key, byteSize(turns), BUDGET_BYTES)
  for (const k of plan.evict) {
    await $.store.delete(k)
    delete index[k]
  }
  if (!plan.fits) turns = trimTurnsToBytes(turns, BUDGET_BYTES)
  await $.store.set(key, turns)
  index[key] = { used: await $.clock.now(), bytes: byteSize(turns) }
  await $.store.set(INDEX_KEY, index)
  await update($, history, () => turns)
}

/** Writes this project's history to ~/.claude/filetrail/exports and says where, slashes forward. */
async function exportHistory($: EngineInterface): Promise<string> {
  const turns = await read($, history)
  if (!turns.length) return 'filetrail: nothing to export yet, no edits recorded in this project.'
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (!home) return 'filetrail: could not find the home folder (HOME and USERPROFILE are unset), so nothing was exported.'
  const now = await $.clock.now()
  // Forward slashes: the reply is drawn as Markdown, where a backslash before punctuation vanishes.
  const path = `${normPath(home).replace(/\/+$/, '')}/.claude/filetrail/exports/${projectName(root)}-${fileStamp(now)}.md`
  await $.fs.write(path, historyMarkdown(root, turns, now))
  return `filetrail: exported ${turns.length} turn${turns.length === 1 ? '' : 's'} to ${path}`
}

/** Puts one step in the prompt box, after whatever the person has typed, for them to ask about and send. */
async function askAbout($: EngineInterface, step: Step, turn: Turn) {
  const filled = await $.prompt.fill({ text: askText(step, turn), mode: 'append' })
  if (!filled.isFilled) $.ui.toast('filetrail: the prompt box is not available right now.')
}

/** Deletes this project's stored history; other projects are untouched. */
async function clearHistory($: EngineInterface): Promise<number> {
  const key = projectKey(root)
  const count = (await read($, history)).length
  await $.store.delete(key)
  const index = ((await $.store.get(INDEX_KEY)) ?? {}) as StoreIndex
  delete index[key]
  await $.store.set(INDEX_KEY, index)
  await update($, history, () => [])
  await update($, view, () => TIMELINE)
  return count
}

function folderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

async function openPane($: EngineInterface, focus = false, closeOnEscape = false) {
  let name = ''
  try { name = folderName(await $.session.cwd()) } catch { /* keep the bare title */ }
  return $.ui.open({
    id: PANE, title: name ? `Trail: ${name}` : 'Trail',
    ...(focus ? { focus: true } : {}), ...(closeOnEscape ? { closeOnEscape: true } : {}),
  })
}

/** How long the band gets to let go of the keys before the pane takes them. */
const HAND_OVER_MS = 200

/**
 * Opens a turn in History, its first edit on show, with the keyboard on the pane and
 * Escape closing it. The band's offer goes first: a pane only takes the keys while
 * nothing else holds them, and a pressed band button does (Replay Theater found this).
 */
async function openReplay($: EngineInterface, turnId: string) {
  await update($, hint, () => null)
  await update($, tab, () => 'history')
  await update($, view, () => ({ turn: turnId, file: null, step: 0 }))
  await $.clock.sleep(HAND_OVER_MS)
  return openPane($, true, true)
}

/** Puts the git actions a command runs in the bar as running; their ids, to finish them by. */
async function startGitActions($: EngineInterface, command: string): Promise<string[]> {
  const calls = gitActionsOf(command, root)
  if (!calls.length) return []
  const at = await $.clock.now()
  const added: GitActionEntry[] = calls.map((c, i) => ({ id: `g${at}.${gitCount++}.${i}`, ...c, state: 'running', at }))
  await update($, gitLog, list => [...list, ...added].slice(-MAX_ACTIONS))
  // The crab acts out the last push or merge of the command while it runs.
  const acted = [...added].reverse().find(a => a.pose)
  if (acted?.pose) {
    gitStage = { id: acted.id, token: await startStage($, { pose: acted.pose, target: acted.target }) }
  }
  return added.map(a => a.id)
}

/** The bar entry the crab acts out, and its stage's token. */
let gitStage: { id: string; token: number } | null = null

/**
 * The crab's stage: what Claude is doing besides a file. A new one replaces the one on show
 * (the newest wins); each has a token, so an older one ending does not touch a newer. Done,
 * it stays FLASH_MS with the pill saying so, then goes. While a helper (the Agent tool)
 * runs, the calls it makes do not take the card from it: a tool call does not say whose it is.
 */
let stageToken = 0
let stageTimer: { cancel: () => void } | null = null
let helpers = 0

/** Shows a stage as running; its token, 0 when a helper holds the card. */
async function startStage($: EngineInterface, s: Omit<Stage, 'state' | 'at'>): Promise<number> {
  if (helpers > 0 && s.pose !== 'agent') return 0
  stageTimer?.cancel()
  stageTimer = null
  const token = ++stageToken
  const at = await $.clock.now()
  await update($, stage, () => ({ ...s, state: 'running', at }))
  return token
}

/**
 * Ends a stage as its call came out. Tests that fail say so; anything else that fails or
 * is refused becomes an error ("Push failed", "Command denied"). Either way it shows for
 * FLASH_MS, unless a newer stage took the card meanwhile.
 */
async function endStage($: EngineInterface, token: number, outcome: StepStatus) {
  if (!token || token !== stageToken) return
  const s = await read($, stage)
  if (!s) return
  const ok = outcome === 'ok'
  const failedWord = outcome === 'denied' ? `${STAGE_NOUN[s.pose]} denied` : undefined
  const next: Stage = ok ? { ...s, state: 'ok' }
    : s.pose === 'test' && outcome === 'failed' ? { ...s, state: 'failed' }
    : { ...s, state: 'failed', ...(failedWord ? { word: failedWord } : {}) }
  await update($, stage, () => next)
  stageTimer = $.clock.after(FLASH_MS, () => {
    if (token !== stageToken) return
    stageTimer = null
    void update($, stage, () => null).catch(() => undefined)
  })
}

/** Shows an error at once, for a call that had no stage of its own (an Edit that failed). */
async function flashError($: EngineInterface, word: string, target: string, dir = '') {
  const token = await startStage($, { pose: 'error', target, dir, word })
  await endStage($, token, 'failed')
}

/** A shell command's stage: tests, a search or a plain command, named by its first line. */
function shellStage($: EngineInterface, command: string): Promise<number> {
  const kind = commandKind(command)
  return startStage($, { pose: kind, target: kind === 'test' ? '' : shortCommand(command), ...(kind === 'test' ? { dir: shortCommand(testCommand(command)) } : {}) })
}

/** The keys of the other tools' calls the crab reads. */
type OtherCall = { tool: string; command?: unknown; pattern?: unknown; path?: unknown; description?: unknown }

/** The stage of a call that is not an edit or Bash: PowerShell, a search, a helper; 0 for the rest. */
async function otherStage($: EngineInterface, e: OtherCall): Promise<number> {
  if (e.tool === 'PowerShell') return shellStage($, String(e.command ?? ''))
  if (e.tool === 'Grep' || e.tool === 'Glob') {
    const where = typeof e.path === 'string' && e.path ? relTo(root, normPath(e.path)) : ''
    return startStage($, { pose: 'search', target: `"${String(e.pattern ?? '').slice(0, 30)}"`, ...(where ? { dir: where } : {}) })
  }
  if (e.tool === 'Agent') return startStage($, { pose: 'agent', target: String(e.description ?? '').slice(0, 40) })
  return 0
}

/** The file a call names, for an error's line: its name, or '' when it names none. */
function fileName(e: unknown): string {
  const path = (e as { file_path?: unknown }).file_path
  return typeof path === 'string' && path ? normPath(path).split('/').pop() ?? '' : ''
}

/** A stage's noun, for "… denied". */
const STAGE_NOUN: Record<Stage['pose'], string> = {
  push: 'Push', merge: 'Merge', search: 'Search', command: 'Command', test: 'Tests', agent: 'Helper', error: 'Call',
}

/** Marks the bar's running actions done, failed or denied, as the command came out. */
async function finishGitActions($: EngineInterface, ids: readonly string[], outcome: StepStatus): Promise<void> {
  const state: GitActionEntry['state'] = outcome === 'denied' ? 'denied' : outcome === 'failed' ? 'failed' : 'ok'
  await update($, gitLog, list => list.map(a => (ids.includes(a.id) ? { ...a, state } : a)))
  if (!gitStage || !ids.includes(gitStage.id)) return
  const { token } = gitStage
  gitStage = null
  await endStage($, token, outcome)
}

/**
 * Shows a file in the pane at a page: "Reading…" at once, then the page, or why not.
 * The text is read again for each page rather than kept, so state holds one page.
 */
async function loadPreview($: EngineInterface, path: string, page: number): Promise<void> {
  await update($, preview, cur => (cur && lower(cur.path) === lower(path) && (cur.source !== undefined || cur.image) ? { ...cur, page } : { path, page }))
  const kind = imageKind(path)
  if (kind) return loadImage($, path, kind)
  let text: string
  try {
    text = String(await $.fs.read(path))
  } catch (err) {
    // The read stops at 4 MiB; anything else is a file gone or unreadable.
    const reason: Preview['reason'] = /MiB|large|size/i.test(String(err)) ? 'large' : 'missing'
    await update($, preview, () => ({ path, page, reason }))
    return
  }
  const why = refusal(text)
  if (why) { await update($, preview, () => ({ path, page, reason: why })); return }
  const shown = pageText(text, page)
  await update($, preview, () => ({ path, page: Math.floor((shown.first - 1) / PAGE_LINES), source: shown.source, total: shown.total }))
}

/**
 * Shows a PNG, JPEG or SVG file: its size from its own header, and the one drawing that shows
 * it when it is small enough. Always its words too, so a surface that draws no picture says what it is.
 */
async function loadImage($: EngineInterface, path: string, kind: ImageKind): Promise<void> {
  let base64: string
  try {
    base64 = (await $.fs.read(path, { as: 'bytes' })).base64
  } catch (err) {
    // The read stops at 4 MiB; anything else is a file gone or unreadable.
    const reason: Preview['reason'] = /MiB|large|size/i.test(String(err)) ? 'large' : 'missing'
    await update($, preview, () => ({ path, page: 0, reason }))
    return
  }
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.match(/=+$/)?.[0].length ?? 0)
  const size = dimensionsOf(kind, base64)
  const draw = bytes <= MAX_DRAW_BYTES ? imageSvg(kind, base64, size) : null
  await update($, preview, () => ({
    path, page: 0,
    image: { kind, ...size, bytes, ...(draw ? { svg: draw.svg, drawWidth: draw.width, drawHeight: draw.height } : {}) },
  }))
}

/** The preview reads its file again after Claude changed it, on the same page. */
/**
 * A call made in a helper's own loop (it carries the helper's id): counted for that helper,
 * and the file it read or wrote kept once the call went through. The main loop's calls carry no id.
 */
async function countHelperCall($: EngineInterface, e: unknown, result: unknown): Promise<void> {
  const by = (e as { agentId?: unknown }).agentId
  if (typeof by !== 'string') return
  try {
    const target = outcomeOf(result) === 'ok' ? targetOf(e as { tool: string }) : null
    const file = target && target.follow && (target.tone === 'read' || target.tone === 'write') ? { path: target.path, tone: target.tone } : null
    const at = await $.clock.now()
    await update($, crew, l => called(l, by, at, file))
  } catch (err) {
    $.ui.log(`filetrail: a helper's call was not counted: ${String(err)}`)
  }
}

/** Sets the helpers against the engine's own list: those that started before a reload join, and ones it says are over close. */
async function syncHelpers($: EngineInterface): Promise<void> {
  const listed = await $.agent.list()
  const at = await $.clock.now()
  await update($, crew, l => reconciled(l, listed.map(a => ({ id: a.id, type: a.type, description: a.description, status: a.status })), at))
}

async function refreshPreview($: EngineInterface, path: string): Promise<void> {
  const cur = await read($, preview)
  if (cur && lower(cur.path) === lower(path)) await loadPreview($, cur.path, cur.page)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'trail', description: 'Show the filetrail pane (file tree, edit history and helpers); args: agents, replay, export, clear' })
    try { await loadHistory($) } catch (err) { $.ui.log(`filetrail: history did not load: ${String(err)}`) }
    // A reload forgets the running turn's steps, so a Now row left in state would never be saved.
    await update($, live, () => null)
    // Nor would a stage left acting in state ever be put down: its timer is gone. A turn
    // left running is over too.
    await update($, stage, () => null)
    await update($, working, () => false)
    // Helpers are read again from the engine: ones that started before a reload are still its own.
    await update($, crew,() => [])
    await update($, agentsOpen, () => [])
    await syncHelpers($).catch(err => $.ui.log(`filetrail: helpers were not read: ${String(err)}`))
    // The tree's view as left in an earlier session.
    const mode = await $.store.get(MODE_KEY)
    if (mode === 'now' || mode === 'all') await update($, files, f => ({ ...f, mode: mode as TreeMode }))
    // The card's size as the handle left it.
    const rows = await $.store.get(ROWS_KEY)
    if (typeof rows === 'number') await update($, files, f => ({ ...f, touchedRows: rows }))
    await listDir($, root)
    scheduleGit($)
    void openPane($)
    return r
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: session.start failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      pending = { id: e.turnId, at: await $.clock.now(), prompt: firstLine(e.text), steps: [] }
      headCache = undefined
      agentsShown = false
      await update($, working, () => true)
      // A new turn: the Now tree starts empty (the last turn's stayed on show until now).
      await update($, turnFiles, () => [])
    } else {
      // A helper sent more to do works again.
      const id = e.agentId
      await update($, crew, l => resumed(l, id)).catch(err => $.ui.log(`filetrail: a helper was not marked: ${String(err)}`))
    }
    return next(e)
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: turn.start failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  // A helper starts: it joins the list the Agents tab and the card's strip draw.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    // Listing a helper never changes what the engine answered: whatever fails here, the spawn's result goes on.
    try {
      if (started.deny === undefined && started.agentId) {
        const id = started.agentId
        const at = await $.clock.now()
        const task = e.description || firstLine(e.prompt ?? '', 60)
        await update($, crew, l => joined(l, { id, type: e.subagentType || 'subagent', description: task }, at))
        // The first helper of a turn turns the pane to the Agents tab (and opens the pane if it was
        // closed), without taking the keyboard; later ones leave the tab where the person put it.
        if (!agentsShown) {
          agentsShown = true
          await update($, tab, () => 'agents')
          await openPane($)
        }
      }
    } catch (err) {
      $.ui.log(`filetrail: a helper was not listed: ${String(err)}`)
    }
    return started
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: agent.spawn failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  // Record each edit, let it run, then mark how it ended. Recording never blocks or changes the call.
  // Reads light up as they start; writes once they went through. A call made in a helper's own
  // loop is counted for it as its result comes back, whichever way the call below goes.
  on('tool.call', async ($, e, down) => {
    const next = async (x: typeof e) => {
      const r = await down(x)
      await countHelperCall($, x, r)
      return r
    }
    let target: Target | null = null
    try { target = targetOf(e as unknown as { tool: string }) } catch { /* nothing to light */ }
    if (target && target.tone === 'read') await touch($, target).catch(err => $.ui.log(`filetrail: highlight failed: ${String(err)}`))
    if (e.tool === 'Bash') {
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      const readers = await lightReads($, command).catch(err => { $.ui.log(`filetrail: Bash highlight failed: ${String(err)}`); return [] as string[] })
      const ids = await startGitActions($, command).catch(err => { $.ui.log(`filetrail: the git bar did not update: ${String(err)}`); return [] as string[] })
      // What the command is about to delete, with each file's text, read while it is still there.
      const doomed = await doomedBy($, command).catch(err => { $.ui.log(`filetrail: a deletion was not read: ${String(err)}`); return [] as Doomed[] })
      // The crab: a push or a merge acts itself out, a commit lights its files; anything else is a stage.
      const token = gitStage && ids.includes(gitStage.id) || isCommit(command) ? 0 : await shellStage($, command)
      // The files the command names, as they are before it runs, to see what it did to them.
      const watched = await watchBefore($, command).catch(() => [] as Watch[])
      const started = await $.clock.now()
      const r = await next(e)
      await recordBlocked($, e, r).catch(err => $.ui.log(`filetrail: a blocked call was not recorded: ${String(err)}`))
      // Claude has seen these files only if the command went through.
      if (outcomeOf(r) === 'ok') for (const p of readers) await noteRead($, p).catch(err => $.ui.log(`filetrail: a read was not noted: ${String(err)}`))
      await endStage($, token, outcomeOf(r)).catch(err => $.ui.log(`filetrail: the crab did not update: ${String(err)}`))
      await recordTestRun($, command, started, r).catch(err => $.ui.log(`filetrail: a test run was not recorded: ${String(err)}`))
      if (doomed.length) {
        try {
          const goneNow: Doomed[] = []
          for (const d of doomed) if (!(await $.fs.exists(d.path))) goneNow.push(d)
          await recordDeleted($, claim(goneNow), 'claude')
          // The tree drops the rows: list again the folders on show that held them.
          const shown = await read($, listing)
          for (const dir of new Set(goneNow.map(d => parentOf(d.path)))) if (lower(dir) in shown) await listDir($, dir)
        } catch (err) {
          $.ui.log(`filetrail: a deletion was not recorded: ${String(err)}`)
        }
      }
      if (watched.length && outcomeOf(r) !== 'denied') {
        await recordShellChanges($, watched, new Set(doomed.map(d => lower(d.path)))).catch(err => $.ui.log(`filetrail: a changed file was not recorded: ${String(err)}`))
      }
      // A folder found not to be a repo is asked again once one is made in it.
      if (makesRepo(command)) { isRepo = null; scheduleGit($) }
      if (ids.length) {
        await finishGitActions($, ids, outcomeOf(r)).catch(err => $.ui.log(`filetrail: the git bar did not update: ${String(err)}`))
        if (!isCommit(command)) scheduleGit($)
      }
      if (isCommit(command)) {
        if (outcomeOf(r) === 'ok') {
          await lightCommit($).catch(err => $.ui.log(`filetrail: commit highlight failed: ${String(err)}`))
          await refreshStale($).catch(err => $.ui.log(`filetrail: read files were not checked: ${String(err)}`))
        }
        scheduleGit($)
      }
      return r
    }
    if (!EDIT_TOOLS.has(e.tool)) {
      const token = await otherStage($, e as unknown as OtherCall).catch(() => 0)
      if (e.tool === 'Agent') helpers++
      const watched = e.tool === 'PowerShell' ? await watchBefore($, String((e as unknown as OtherCall).command ?? '')).catch(() => [] as Watch[]) : []
      const started = await $.clock.now()
      let r
      try { r = await next(e) } finally { if (e.tool === 'Agent') helpers-- }
      const outcome = outcomeOf(r)
      if (outcome === 'ok' && target && target.tone === 'read' && target.follow) await noteRead($, target.path).catch(err => $.ui.log(`filetrail: a read was not noted: ${String(err)}`))
      if (e.tool === 'PowerShell') await recordTestRun($, String((e as unknown as OtherCall).command ?? ''), started, r).catch(err => $.ui.log(`filetrail: a test run was not recorded: ${String(err)}`))
      await recordBlocked($, e, r).catch(err => $.ui.log(`filetrail: a blocked call was not recorded: ${String(err)}`))
      if (watched.length && outcome !== 'denied') {
        await recordShellChanges($, watched, new Set()).catch(err => $.ui.log(`filetrail: a changed file was not recorded: ${String(err)}`))
      }
      if (token) await endStage($, token, outcome).catch(err => $.ui.log(`filetrail: the crab did not update: ${String(err)}`))
      else if (outcome !== 'ok') await flashError($, `${e.tool} ${outcome}`, '', fileName(e)).catch(() => undefined)
      return r
    }
    let steps: Turn['steps'] = []
    try {
      const call = e as unknown as EditCall
      let before: string | null = null
      if (call.file_path && (await $.fs.exists(call.file_path))) before = String(await $.fs.read(call.file_path))
      const at = await $.clock.now()
      pending ??= { id: `t${at}`, at, prompt: '', steps: [] }
      steps = stepsFor(call, before, root, at, `${pending.id}.${callCount++}`)
      pending.steps.push(...steps)
      if (steps.length) await showLive($)
    } catch (err) {
      $.ui.log(`filetrail: an edit was not recorded: ${String(err)}`)
    }
    const r = await next(e)
    const status = outcomeOf(r)
    for (const s of steps) s.status = status
    await recordBlocked($, e, r).catch(err => $.ui.log(`filetrail: a blocked call was not recorded: ${String(err)}`))
    if (status !== 'ok') await flashError($, `${e.tool} ${status}`, '', fileName(e)).catch(() => undefined)
    if (steps.length) await showLive($).catch(err => $.ui.log(`filetrail: the live turn did not update: ${String(err)}`))
    if (status === 'ok' && steps[0]) {
      // A Write may add a file: list its folder again if it is on show.
      const dir = lower(parentOf(steps[0].path))
      if (dir in (await read($, listing))) await listDir($, parentOf(steps[0].path))
      scheduleGit($)
      await refreshPreview($, steps[0].path).catch(err => $.ui.log(`filetrail: the preview did not update: ${String(err)}`))
      if (target) await touch($, target).catch(err => $.ui.log(`filetrail: highlight failed: ${String(err)}`))
    }
    return r
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: recording an edit failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  // A main-loop turn that changed files joins the history; subagent edits ride in it.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) {
      const id = e.agentId
      const at = await $.clock.now()
      await update($, crew, l => finished(l, id, at, e.reason === 'answer')).catch(err => $.ui.log(`filetrail: a helper was not closed: ${String(err)}`))
      return r
    }
    const turn = pending
    pending = null
    await update($, working, () => false)
    // Deletions the refresh below finds were Claude's, and go in this turn.
    turnEndedAt = await $.clock.now()
    lastTurn = turn
    if (turn && (turn.steps.length || turn.blocked?.some(b => b.kind !== 'failed'))) {
      try { await saveTurn($, turn) } catch (err) { $.ui.log(`filetrail: history was not saved: ${String(err)}`) }
      // The band offers this turn until it is replayed or another turn changes files.
      if (turn.steps.length) await update($, hint, () => hintFor(turn))
    }
    // Saved now (or it changed nothing): the timeline's Now row gives way to the saved turn.
    await update($, live, () => null)
    // The turn is over: the file Claude was on goes out (its ◂ stays).
    if (onFile) await unlight($, onFile).catch(err => $.ui.log(`filetrail: highlight failed: ${String(err)}`))
    // Bash may have changed files too: list the open folders and read git again.
    await relist($)
    // A helper stopped or lost without its own turn ending would stay "working": the engine's list says.
    if (running(await read($, crew)).length) await syncHelpers($).catch(err => $.ui.log(`filetrail: helpers were not read: ${String(err)}`))
    // Files Claude read earlier may have changed in the turn: its own edit, a commit, or outside.
    await refreshStale($).catch(err => $.ui.log(`filetrail: read files were not checked: ${String(err)}`))
    // Files may have come or gone: a search already in use gets a fresh list.
    if (await read($, index)) void ensureIndex($).catch(err => $.ui.log(`filetrail: the search list was not rebuilt: ${String(err)}`))
    scheduleGit($)
    return r
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: turn.complete failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  // A prompt typed while a file is selected carries one line saying so, until ✕ clears the
  // selection. An @path in it that names a file of the project opens the tree there.
  // Slash commands and hidden prompts are passed as they are.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    // The replay offer was about the turn just read: the next prompt takes it down.
    if (await read($, hint)) await update($, hint, () => null)
    for (const mention of mentionedPaths(e.text)) {
      const path = resolveMention(root, mention)
      if (isInside(root, path) && (await $.fs.exists(path))) {
        await reveal($, path, true)
        break
      }
    }
    const selected = (await read($, files)).selected
    if (!selected) return next(e)
    return next({ ...e, context: [...(e.context ?? []), contextLine(root, selected)] })
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: prompt.submit failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  on('command.run', { command: 'trail' }, async ($, e) => {
    const args = (e.args ?? '').trim().toLowerCase()
    if (args === '') {
      const opened = await openPane($, true)
      return { text: opened.isPlaced ? 'filetrail opened.' : `filetrail is open but not drawn: ${opened.reason}` }
    }
    if (args === 'agents') {
      await syncHelpers($).catch(err => $.ui.log(`filetrail: helpers were not read: ${String(err)}`))
      await update($, tab, () => 'agents')
      const opened = await openPane($, true)
      return { text: opened.isPlaced ? 'filetrail opened on the helpers.' : `filetrail is open but not drawn: ${opened.reason}` }
    }
    if (args === 'export') return { text: await exportHistory($) }
    if (args === 'replay') {
      const latest = (await read($, history)).filter(t => t.steps.length || !t.blocked?.length).at(-1)
      if (!latest) return { text: 'filetrail: no edits recorded in this project yet.' }
      await openReplay($, latest.id)
      return { text: `filetrail: replaying ${latest.steps.length} edit${latest.steps.length === 1 ? '' : 's'} from ${stamp(latest.at)}.` }
    }
    // Clearing cannot be undone, so it asks for the word first.
    if (args === 'clear') {
      const n = (await read($, history)).length
      return { text: n ? `This deletes ${n} turn${n === 1 ? '' : 's'} of filetrail history for ${projectName(root)}, for good. Run /trail clear yes to go ahead.` : 'filetrail: there is no history to clear in this project.' }
    }
    if (args === 'clear yes') {
      const n = await clearHistory($)
      return { text: `filetrail: cleared ${n} turn${n === 1 ? '' : 's'} of history for ${projectName(root)}.` }
    }
    return { text: 'filetrail: /trail opens the pane, /trail agents shows the helpers Claude started, /trail replay steps through the last turn\'s edits, /trail export writes the history as Markdown, /trail clear deletes this project\'s history.' }
  })

  // The band above the prompt: the offer to replay the last turn that changed files,
  // under whatever the plugins beneath draw. A survey has the band to itself.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const offer = await read($, hint)
    if (!offer) return next(e)
    const beneath = await next(e)
    const els = $.ui.resolve(e)
    const { Box } = els
    return (
      <Box flexDirection="column">
        {beneath}
        {hintRow(els, offer, () => fire($, 'replaying', () => openReplay($, offer.turn)))}
      </Box>
    )
  }).catch(async ($, e, next) => {
    // Never take the band from the plugins beneath: draw theirs, with one line saying why ours is missing.
    const beneath = next.called ? undefined : await next(e)
    try {
      const { Box, Text } = $.ui.resolve(e)
      const reason = next.error instanceof Error ? next.error.message : String(next.error)
      return (
        <Box flexDirection="column">
          {beneath}
          <Text dimColor>filetrail could not draw its replay line: {reason}</Text>
        </Box>
      )
    } catch {
      return beneath
    }
  })

  // A tree row is a Client (hooks/row.tsx) so its colours paint on the desktop; its press
  // arrives here as a post, and the row's own action runs, as a Button's onPress would.
  // A double-click's second click opens a file (a folder has nothing to open, so it is
  // let be rather than closing what the first click opened); a right-click copies the path.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { press?: unknown; open?: unknown; copy?: unknown; full?: unknown; tool?: unknown; resize?: unknown; end?: unknown } | null
    if (e.requestId !== PANE || !data || typeof data !== 'object') return next(e)
    if (typeof data.tool === 'string' && toolPresses.has(data.tool)) { toolPresses.get(data.tool)!(); return {} }
    // The card's handle, let go: as many touched files as it asks, kept for the next session.
    if (typeof data.resize === 'number' && e.element === 'card-handle') {
      const rows = Math.max(0, Math.min(TOUCHED_MAX, Math.round(data.resize)))
      await update($, files, f => ({ ...f, touchedRows: rows, touchedOpen: false }))
      await $.store.set(ROWS_KEY, rows)
      return {}
    }
    if (data.press === true && rowPresses.has(e.element)) { rowPresses.get(e.element)!(); return {} }
    if (data.open === true) { rowOpens.get(e.element)?.(); return {} }
    if (data.reveal === true) { rowReveals.get(e.element)?.(); return {} }
    if (data.copy === true && rowCopies.has(e.element)) { rowCopies.get(e.element)!(data.full === true, e.surface); return {} }
    return next(e)
  })

  // Logged only: a close that never reaches here is the surface's, one that does is let through.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    $.ui.log(`filetrail: pane close from ${e.origin.kind}`)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The terminal's table carries an Svg that draws nothing (seen in the test kit: an empty
    // Box): left out there, the crab falls back to its blocks and the branch to its glyph.
    const els = $.ui.resolve(e)
    if (e.surface === 'terminal') NO_SVG.add(els)
    clearRows()
    const { Box, Text, Button } = els
    const current = await read($, tab)
    const running = await read($, live)
    const turnsAll = withLive(await read($, history), running)
    const go = (to: Tab) => () => void update($, tab, () => to)
    // The engine's own list is read as the tab opens, so a helper this module missed shows too.
    const goAgents = () => fire($, 'opening the agents', async () => {
      await syncHelpers($).catch(err => $.ui.log(`filetrail: helpers were not read: ${String(err)}`))
      await update($, tab, () => 'agents')
    })
    const mates = await read($, crew)

    return (
      <Box flexDirection="column">
        <Box key="tabs" flexDirection="row" flexWrap="wrap" gap={1} minWidth={0}>
          <Button key="tab-files" label="Files" hotkey="f"
            {...(current === 'files' ? { variant: 'primary' as const } : { dimColor: true })}
            onPress={go('files')} />
          <Button key="tab-history" label="History" hotkey="h"
            {...(current === 'history' ? { variant: 'primary' as const } : { dimColor: true })}
            onPress={go('history')} />
          {/* Always there, beside Files and History: the label counts the helpers once there are some. */}
          <Button key="tab-agents" label={tabLabel(mates)}
            {...(current === 'agents' ? { variant: 'primary' as const } : { dimColor: true })}
            onPress={goAgents} />
        </Box>
        <Box key="body" flexDirection="column" marginTop={1}>
          {current === 'agents'
            ? agentsView(els, mates, await $.clock.now(), root, {
                view: path => fire($, 'showing the file', async () => {
                  await update($, tab, () => 'files')
                  await loadPreview($, path, 0)
                }),
                toggle: id => fire($, 'opening a helper', () => update($, agentsOpen, l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))),
              }, await read($, agentsOpen), e.props.bodyColumns)
            : current === 'files'
            ? filesView(els, root, await read($, listing), await read($, files), await read($, git), turnsAll, await read($, flash), await read($, last), {
                toggle: dir => fire($, 'opening a folder', async () => {
                  const k = lower(dir.path)
                  // Opened or closed by the person: the follow leaves it, and the folders above
                  // it, as they are for a while (they may be browsing it).
                  browsed.set(k, await $.clock.now())
                  const isOpen = (await read($, files)).expanded.includes(k)
                  await update($, files, f => ({ ...f, expanded: isOpen ? f.expanded.filter(d => d !== k) : [...f.expanded, k] }))
                  if (!isOpen && !(k in (await read($, listing)))) await listDir($, dir.path)
                }),
                select: file => fire($, 'selecting a file', () => update($, files, f => ({ ...f, selected: file.path }))),
                history: path => fire($, 'showing history', async () => {
                  await update($, view, () => ({ turn: null, file: path, step: 0 }))
                  await update($, tab, () => 'history')
                }),
                unselect: () => fire($, 'clearing the selection', () => update($, files, f => ({ ...f, selected: null }))),
                search: query => fire($, 'searching', async () => {
                  await update($, files, f => ({ ...f, query }))
                  if (query.trim() && !(await read($, index))) await ensureIndex($)
                }),
                open: path => fire($, 'opening the file', () => openFile($, path)),
                showInFolder: (path, isDir) => fire($, 'showing the file in its folder', () => showInFolder($, path, isDir)),
                copy: (path, full, surface) => fire($, 'copying the path', () => copyPath($, path, full, surface)),
                toggleGitLog: () => fire($, 'opening the git bar', () => update($, files, f => ({ ...f, gitOpen: !f.gitOpen }))),
                toggleTouched: () => fire($, 'listing the touched files', () => update($, files, f => ({ ...f, touchedOpen: !f.touchedOpen }))),
                setMode: mode => fire($, 'switching the tree', async () => {
                  await update($, files, f => ({ ...f, mode }))
                  await $.store.set(MODE_KEY, mode)
                }),
                openInAll: dir => fire($, 'opening a folder', async () => {
                  const k = lower(dir.path)
                  browsed.set(k, await $.clock.now())
                  const up = (foldersTo(root, dir.path) ?? []).map(lower)
                  await update($, files, f => ({ ...f, mode: 'all' as const, expanded: [...new Set([...f.expanded, ...up, k])] }))
                  await $.store.set(MODE_KEY, 'all')
                  if (!(k in (await read($, listing)))) await listDir($, dir.path)
                }),
                dismissTests: () => fire($, 'putting the test result away', () => update($, tests, dismissRuns)),
                refresh: () => fire($, 'refreshing', async () => {
                  await relist($)
                  await refreshGit($)
                  await refreshStale($)
                  if (await read($, index)) await ensureIndex($)
                }),
                toggleDots: () => fire($, 'showing dotfiles', () => update($, files, f => ({ ...f, hideDots: !f.hideDots }))),
                collapseAll: () => fire($, 'closing the folders', async () => {
                  browsed.clear()
                  await update($, files, f => ({ ...f, expanded: [], top: 0 }))
                }),
                preview: path => fire($, 'showing the file', () => loadPreview($, path, 0)),
                reveal: path => fire($, 'going to the file', () => reveal($, path, true)),
                previewing: {
                  back: () => fire($, 'going back to the tree', () => update($, preview, () => null)),
                  open: path => fire($, 'opening the file', () => openFile($, path)),
                  page: page => fire($, 'turning the page', async () => {
                    const cur = await read($, preview)
                    if (cur) await loadPreview($, cur.path, page)
                  }),
                },
                agents: goAgents,
                goToSelected: () => fire($, 'going to the selected file', async () => {
                  const at = (await read($, files)).selected
                  if (at) await reveal($, at, true)
                }),
                openHit: rel => fire($, 'opening a search result', async () => {
                  await update($, files, f => ({ ...f, query: '' }))
                  await reveal($, joinPath(root, rel), true)
                }),
              }, e.props.bodyColumns, await read($, index), await read($, gitLog), await read($, preview), await read($, touched), await read($, stage), await read($, working), await read($, turnFiles), await read($, tests), await read($, stale), mates)
            : historyView(els, turnsAll, await read($, view), {
                set: v => fire($, 'moving in history', () => update($, view, () => v)),
                ask: (step, turn) => fire($, 'asking Claude', () => askAbout($, step, turn)),
                exportAll: () => fire($, 'exporting', async () => $.ui.toast(await exportHistory($))),
                close: () => fire($, 'closing the pane', () => $.ui.close({ id: PANE })),
                view: (path, line) => fire($, 'showing the file', async () => {
                  await update($, tab, () => 'files')
                  await loadPreview($, path, pageOf(line))
                }),
                reveal: path => fire($, 'showing in Files', async () => {
                  await update($, tab, () => 'files')
                  await reveal($, path, true)
                }),
              }, await $.clock.now(), e.props.bodyColumns, running?.id ?? null, await read($, ignored))}
        </Box>
      </Box>
    )
  }).catch(async ($, e, next) => {
    // Never fall back silently: say the drawing failed and why.
    const { Box, Text } = $.ui.resolve(e)
    const reason = next.error instanceof Error ? next.error.message : String(next.error)
    return (
      <Box flexDirection="column">
        <Text key="failed" dimColor>filetrail: the pane failed to draw: {reason}</Text>
      </Box>
    )
  })
}
