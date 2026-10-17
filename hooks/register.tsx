// filetrail: a file tree and a history of Claude's edits in one pane.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, FilesView, GitActionEntry, GitInfo, Hint, HistoryView, Preview, SearchIndex, Step, StepStatus, Tab, Tone, TouchedFile, Turn } from '../types'
import { BROWSE_MS, FLASH_MS, GLIDE_MS, HOLD_MS, clampTop, foldersTo, glide, targetOf, topFor, treeLines, treeRows, treeWindow } from './activity'
import type { Target } from './activity'
import { hintFor, hintRow } from './band'
import { isCommit, readTargets } from './bash'
import { contextLine, mentionedPaths, resolveMention } from './context'
import { fullCopy, openCommand, osOf, relativeCopy } from './open'
import type { HostOs } from './open'
import { askText, fileStamp, historyMarkdown, projectName, stamp } from './export'
import { filesView, MAX_ROWS } from './files-view'
import { clearRows, rowCopies, rowOpens, rowPresses, toolPresses } from './presses'
import { parseNumstat, parseStatus } from './git'
import { gitActionsOf, makesRepo, MAX_ACTIONS } from './git-actions'
import { pageOf, pageText, PAGE_LINES, refusal } from './preview'
import {
  addTurn, byteSize, BUDGET_BYTES, EDIT_TOOLS, firstLine, INDEX_KEY, MAX_TURNS, normPath, outcomeOf, planBudget,
  isInside, projectKey, relTo, stepsFor, trimTurnsToBytes,
} from './history'
import type { EditCall, StoreIndex } from './history'
import { historyView, TIMELINE } from './history-view'
import { MAX_INDEX_FILES, parseLsFiles, SKIP_DIRS } from './search'
import { joinPath, lower, parentOf, toEntries, visibleRows } from './tree'

export const PANE = 'filetrail'

const tab = atom({ plugin: 'filetrail', key: 'tab' } as const, 'files' as Tab)
const history = atom({ plugin: 'filetrail', key: 'history' } as const, [] as Turn[])
const view = atom({ plugin: 'filetrail', key: 'view' } as const, TIMELINE as HistoryView)
const listing = atom({ plugin: 'filetrail', key: 'listing' } as const, {} as Record<string, Entry[]>)
const git = atom({ plugin: 'filetrail', key: 'git' } as const, null as GitInfo | null)
const files = atom({ plugin: 'filetrail', key: 'files' } as const, { expanded: [], selected: null } as FilesView)
const flash = atom({ plugin: 'filetrail', key: 'flash' } as const, {} as Record<string, Tone>)
const last = atom({ plugin: 'filetrail', key: 'last' } as const, null as { path: string; tone: Tone } | null)
const hint = atom({ plugin: 'filetrail', key: 'hint' } as const, null as Hint | null)
const live = atom({ plugin: 'filetrail', key: 'live' } as const, null as Turn | null)
const index = atom({ plugin: 'filetrail', key: 'index' } as const, null as SearchIndex | null)
const gitLog = atom({ plugin: 'filetrail', key: 'actions' } as const, [] as GitActionEntry[])
const preview = atom({ plugin: 'filetrail', key: 'preview' } as const, null as Preview | null)
const touched = atom({ plugin: 'filetrail', key: 'touched' } as const, [] as TouchedFile[])
/** Files the Claude touched list keeps. */
const MAX_TOUCHED = 8
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
 * Opens the folders down to `path` (listing those not listed yet) and scrolls
 * the tree to its row; `select` also selects it. Paths outside the root are left alone.
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
  // The tree glides to the row under the fixed head: no pane scroll, so the card stays.
  await glideTo($, lower(path))
}

/**
 * The pane's fixed head and the tree under it. The head's height is measured, not known
 * (the card's rows and the crab's pixels vary): each ui.scroll says how many rows the
 * whole pane drew, less the tree's lines drawn then. A first guess on the small side
 * draws the tree too long, so the first measure comes soon.
 */
const HEAD_GUESS = 4
const pane = { headRows: HEAD_GUESS, fit: 0, treeLines: 0, windowAt: 0 }

/**
 * Asks the pane to move to its end once its redraws settle: the ui.scroll that comes
 * measures the head (and the hook keeps the window where it is). A pane whose content
 * fits raises none, nothing then being off screen.
 */
let measuring: { cancel: () => void } | null = null
function scheduleMeasure($: EngineInterface) {
  measuring?.cancel()
  measuring = $.clock.after(MEASURE_MS, () => {
    measuring = null
    void $.ui.scroll({ to: 'end', in: PANE }).catch(() => undefined)
  })
}
const MEASURE_MS = 400

/** Counts glides, so a newer one stops an older one mid-way. */
let gliding = 0

/** Moves the tree's first row, in a few steps, so `path` shows; it moves only when it is out of view. */
async function glideTo($: EngineInterface, path: string) {
  const f = await read($, files)
  const rows = visibleRows(root, await read($, listing), f.expanded, f.hideDots === true).slice(0, MAX_ROWS)
  const at = rows.findIndex(r => lower(r.entry.path) === path)
  if (at < 0 || !pane.fit) return
  const from = f.top ?? 0
  // Two rows of the window may be the above and below lines.
  const to = topFor(at, rows.length, Math.max(1, pane.fit - 2), from)
  const steps = glide(from, to)
  const mine = ++gliding
  steps.forEach((top, k) => {
    $.clock.after(GLIDE_MS * k, () => {
      if (mine !== gliding) return
      void update($, files, x => ({ ...x, top })).catch(() => undefined)
    })
  })
}

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
  await update($, flash, f => ({ ...f, [k]: target.tone }))
  await update($, last, () => ({ path: k, tone: target.tone }))
  // A file read, written or committed joins the Claude touched list (a searched folder does not).
  if (target.follow || target.tone === 'commit') {
    const at = await $.clock.now()
    await update($, touched, list => [{ path: normPath(target.path), tone: target.tone, at }, ...list.filter(f => lower(f.path) !== k)].slice(0, MAX_TOUCHED))
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
async function lightReads($: EngineInterface, command: string) {
  let followed = false
  for (const t of readTargets(command, root).slice(0, MAX_BASH_TARGETS)) {
    if (!isInside(root, t.path) || !(await $.fs.exists(t.path))) continue
    await touch($, { path: t.path, tone: 'read', follow: t.follow && !followed })
    if (t.follow) followed = true
  }
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
  try {
    const listed = toEntries(dir, await $.fs.list(dir))
    entries = listed.entries
    if (listed.more) $.ui.log(`filetrail: ${dir} shows ${entries.length} entries; ${listed.more} more are left out`)
  } catch (err) {
    $.ui.log(`filetrail: could not list ${dir}: ${String(err)}`)
  }
  await update($, listing, l => ({ ...l, [lower(dir)]: entries }))
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
  await update($, git, () => info)
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
  if (!now || !now.steps.length) return
  await update($, live, () => ({ ...now, steps: now.steps.map(s => ({ ...s })) }))
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
  return added.map(a => a.id)
}

/** Marks the bar's running actions done, failed or denied, as the command came out. */
async function finishGitActions($: EngineInterface, ids: readonly string[], outcome: StepStatus): Promise<void> {
  const state: GitActionEntry['state'] = outcome === 'denied' ? 'denied' : outcome === 'failed' ? 'failed' : 'ok'
  await update($, gitLog, list => list.map(a => (ids.includes(a.id) ? { ...a, state } : a)))
}

/**
 * Shows a file in the pane at a page: "Reading…" at once, then the page, or why not.
 * The text is read again for each page rather than kept, so state holds one page.
 */
async function loadPreview($: EngineInterface, path: string, page: number): Promise<void> {
  await update($, preview, cur => (cur && lower(cur.path) === lower(path) && cur.source !== undefined ? { ...cur, page } : { path, page }))
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

/** The preview reads its file again after Claude changed it, on the same page. */
async function refreshPreview($: EngineInterface, path: string): Promise<void> {
  const cur = await read($, preview)
  if (cur && lower(cur.path) === lower(path)) await loadPreview($, cur.path, cur.page)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'trail', description: 'Show the filetrail pane (file tree and edit history); args: replay, export, clear' })
    try { await loadHistory($) } catch (err) { $.ui.log(`filetrail: history did not load: ${String(err)}`) }
    // A reload forgets the running turn's steps, so a Now row left in state would never be saved.
    await update($, live, () => null)
    await listDir($, root)
    scheduleGit($)
    void openPane($)
    return r
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: session.start failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) pending = { id: e.turnId, at: await $.clock.now(), prompt: firstLine(e.text), steps: [] }
    return next(e)
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: turn.start failed: ${String(next.error)}`)
    return next.called ? undefined : next(e)
  })

  // Record each edit, let it run, then mark how it ended. Recording never blocks or changes the call.
  // Reads light up as they start; writes once they went through.
  on('tool.call', async ($, e, next) => {
    let target: Target | null = null
    try { target = targetOf(e as unknown as { tool: string }) } catch { /* nothing to light */ }
    if (target && target.tone === 'read') await touch($, target).catch(err => $.ui.log(`filetrail: highlight failed: ${String(err)}`))
    if (e.tool === 'Bash') {
      const command = String((e as unknown as { command?: unknown }).command ?? '')
      await lightReads($, command).catch(err => $.ui.log(`filetrail: Bash highlight failed: ${String(err)}`))
      const ids = await startGitActions($, command).catch(err => { $.ui.log(`filetrail: the git bar did not update: ${String(err)}`); return [] as string[] })
      const r = await next(e)
      // A folder found not to be a repo is asked again once one is made in it.
      if (makesRepo(command)) { isRepo = null; scheduleGit($) }
      if (ids.length) {
        await finishGitActions($, ids, outcomeOf(r)).catch(err => $.ui.log(`filetrail: the git bar did not update: ${String(err)}`))
        if (!isCommit(command)) scheduleGit($)
      }
      if (isCommit(command)) {
        if (outcomeOf(r) === 'ok') await lightCommit($).catch(err => $.ui.log(`filetrail: commit highlight failed: ${String(err)}`))
        scheduleGit($)
      }
      return r
    }
    if (!EDIT_TOOLS.has(e.tool)) return next(e)
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
    if (e.agentId !== undefined) return r
    const turn = pending
    pending = null
    if (turn && turn.steps.length) {
      try { await saveTurn($, turn) } catch (err) { $.ui.log(`filetrail: history was not saved: ${String(err)}`) }
      // The band offers this turn until it is replayed or another turn changes files.
      await update($, hint, () => hintFor(turn))
    }
    // Saved now (or it changed nothing): the timeline's Now row gives way to the saved turn.
    await update($, live, () => null)
    // The turn is over: the file Claude was on goes out (its ◂ stays).
    if (onFile) await unlight($, onFile).catch(err => $.ui.log(`filetrail: highlight failed: ${String(err)}`))
    // Bash may have changed files too: list the open folders and read git again.
    await relist($)
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
    if (args === 'export') return { text: await exportHistory($) }
    if (args === 'replay') {
      const latest = (await read($, history)).at(-1)
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
    return { text: 'filetrail: /trail opens the pane, /trail replay steps through the last turn\'s edits, /trail export writes the history as Markdown, /trail clear deletes this project\'s history.' }
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
    const data = e.data as { press?: unknown; open?: unknown; copy?: unknown; full?: unknown; tool?: unknown } | null
    if (e.requestId !== PANE || !data || typeof data !== 'object') return next(e)
    if (typeof data.tool === 'string' && toolPresses.has(data.tool)) { toolPresses.get(data.tool)!(); return {} }
    if (data.press === true && rowPresses.has(e.element)) { rowPresses.get(e.element)!(); return {} }
    if (data.open === true) { rowOpens.get(e.element)?.(); return {} }
    if (data.copy === true && rowCopies.has(e.element)) { rowCopies.get(e.element)!(data.full === true, e.surface); return {} }
    return next(e)
  })

  // The tree scrolls under a fixed head: in the Files tab's tree, the person's wheel moves
  // the tree's first row and the pane's window stays at the top, so the card stays on
  // screen. A move the pane needs to get back to the top goes through. Elsewhere (History,
  // a preview, search results) the pane scrolls as the engine moves it.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const f = await read($, files)
    if ((await read($, tab)) !== 'files' || (f.query ?? '').trim() || (await read($, preview))) return next(e)
    // Measure the head: all the pane drew, less the tree's lines.
    const head = e.contentRows - pane.treeLines
    if (head > 0 && head !== pane.headRows) {
      pane.headRows = head
      $.ui.invalidate('ui.render')
    }
    if (pane.windowAt > 0) return next({ ...e, offset: 0 })
    // A plugin's move to the top goes through; the measuring move to the end stays put.
    if (e.origin.kind !== 'person') return e.offset === 0 ? next(e) : {}
    const count = Math.min(visibleRows(root, await read($, listing), f.expanded, f.hideDots === true).length, MAX_ROWS)
    const top = clampTop((f.top ?? 0) + e.by, count, Math.max(1, pane.fit - 1))
    // The person takes over from a glide still under way.
    gliding++
    if (top !== (f.top ?? 0)) await update($, files, x => ({ ...x, top }))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    // Where the pane's window stands, the tree's room under the head, and the lines it
    // will draw: what the ui.scroll hook measures the head against.
    pane.windowAt = e.props.scroll.offset
    pane.fit = treeRows(e.props.scroll.bodyRows, pane.headRows)
    {
      const f = await read($, files)
      const count = Math.min(visibleRows(root, await read($, listing), f.expanded, f.hideDots === true).length, MAX_ROWS)
      pane.treeLines = count ? treeLines(treeWindow(count, f.top ?? 0, pane.fit)) : 1
      if ((await read($, tab)) === 'files' && !(f.query ?? '').trim() && !(await read($, preview))) scheduleMeasure($)
    }
    clearRows()
    const { Box, Text, Button } = els
    const current = await read($, tab)
    const running = await read($, live)
    const turnsAll = withLive(await read($, history), running)
    const go = (to: Tab) => () => void update($, tab, () => to)

    return (
      <Box flexDirection="column">
        <Box key="tabs" flexDirection="row" gap={1}>
          <Button key="tab-files" label="Files" hotkey="f"
            {...(current === 'files' ? { variant: 'primary' as const } : { dimColor: true })}
            onPress={go('files')} />
          <Button key="tab-history" label="History" hotkey="h"
            {...(current === 'history' ? { variant: 'primary' as const } : { dimColor: true })}
            onPress={go('history')} />
        </Box>
        <Box key="body" flexDirection="column" marginTop={1}>
          {current === 'files'
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
                copy: (path, full, surface) => fire($, 'copying the path', () => copyPath($, path, full, surface)),
                toggleGitLog: () => fire($, 'opening the git bar', () => update($, files, f => ({ ...f, gitOpen: !f.gitOpen }))),
                toggleTouched: () => fire($, 'listing the touched files', () => update($, files, f => ({ ...f, touchedOpen: !f.touchedOpen }))),
                refresh: () => fire($, 'refreshing', async () => {
                  await relist($)
                  await refreshGit($)
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
                goToSelected: () => fire($, 'going to the selected file', async () => {
                  const at = (await read($, files)).selected
                  if (at) await reveal($, at, true)
                }),
                openHit: rel => fire($, 'opening a search result', async () => {
                  await update($, files, f => ({ ...f, query: '' }))
                  await reveal($, joinPath(root, rel), true)
                }),
              }, e.props.bodyColumns, await read($, index), await read($, gitLog), await read($, preview), await read($, touched), pane.fit)
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
              }, await $.clock.now(), e.props.bodyColumns, running?.id ?? null)}
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
