// filetrail: a file tree and a history of Claude's edits in one pane.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entry, FilesView, GitInfo, Hint, HistoryView, Step, Tab, Tone, Turn } from '../types'
import { FLASH_MS, foldersTo, targetOf } from './activity'
import type { Target } from './activity'
import { hintFor, hintRow } from './band'
import { askText, fileStamp, historyMarkdown, projectName, stamp } from './export'
import { filesView } from './files-view'
import { parseNumstat, parseStatus } from './git'
import {
  addTurn, byteSize, BUDGET_BYTES, EDIT_TOOLS, firstLine, INDEX_KEY, MAX_TURNS, normPath, outcomeOf, planBudget,
  projectKey, stepsFor, trimTurnsToBytes,
} from './history'
import type { EditCall, StoreIndex } from './history'
import { historyView, TIMELINE } from './history-view'
import { lower, parentOf, toEntries } from './tree'

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

/** The saved turns, and the running one after them while it has edits and is not saved yet. */
function withLive(turns: readonly Turn[], now: Turn | null): readonly Turn[] {
  return now && !turns.some(t => t.id === now.id) ? [...turns, now] : turns
}

// The project whose history this session records: the cwd at session start.
let root = ''
// The main-loop turn running now; its steps reach the store when it completes.
let pending: Turn | null = null
let callCount = 0
// Outside a repo git is asked once per load, not after every edit.
let isRepo: boolean | null = null
let gitTimer: { cancel: () => void } | null = null
const flashTimers = new Map<string, { cancel: () => void }>()

const rowKey = (path: string) => `row-${lower(path)}`
const SCROLL_WAIT_MS = 120

/** Runs a button's work without awaiting it; a failure goes to the transcript, never unhandled. */
function fire($: EngineInterface, what: string, work: () => Promise<unknown>) {
  void work().catch(err => {
    try { $.ui.log(`filetrail: ${what} failed: ${String(err)}`) } catch { /* unloading */ }
  })
}

/**
 * Opens the folders down to `path` (listing those not listed yet) and scrolls
 * the tree to its row; `select` also selects it. Paths outside the root are left alone.
 */
async function reveal($: EngineInterface, path: string, select: boolean) {
  const dirs = foldersTo(root, path)
  if (!dirs) return
  const listed = await read($, listing)
  for (const d of dirs) if (!(lower(d) in listed)) await listDir($, d)
  await update($, files, f => ({
    expanded: [...new Set([...f.expanded, ...dirs.map(lower)])],
    selected: select ? path : f.selected,
  }))
  // The row is drawn on the next redraw after its folders open, so the scroll waits on a
  // timer: a timer outlives the hook that set it, where awaited work would hold the call.
  // Refused while the row is not drawn (another tab on show): the reason goes to the debug log.
  $.clock.after(SCROLL_WAIT_MS, () => {
    void $.ui.scroll({ to: { key: rowKey(path) }, in: PANE })
      .catch((err: unknown) => ({ deny: String(err) }))
      .then(moved => { if ('deny' in moved) $.ui.log(`filetrail: did not scroll to ${path}: ${moved.deny}`, { to: 'debug' }) })
      .catch(() => undefined)
  })
}

/**
 * Lights the row Claude touched for a moment and, for one file, opens the tree to it.
 * Awaited by the tool.call hook: work a hook leaves running when it returns can be cut off
 * with its dispatch (seen live: the flash never showed, and no failure line either).
 * The fade and the scroll run on timers, which outlive the dispatch.
 */
async function touch($: EngineInterface, target: Target) {
  const k = lower(target.path)
  await update($, flash, f => ({ ...f, [k]: target.tone }))
  await update($, last, () => ({ path: k, tone: target.tone }))
  flashTimers.get(k)?.cancel()
  flashTimers.set(k, $.clock.after(FLASH_MS, () => {
    flashTimers.delete(k)
    // The module may be unloading when this fires; nothing to clean up then.
    void update($, flash, f => Object.fromEntries(Object.entries(f).filter(([p]) => p !== k))).catch(() => undefined)
  }))
  if (target.follow) await reveal($, target.path, false)
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
  const dirs = listed.filter(d => d === lower(root) || open.has(d))
  for (const d of dirs) await listDir($, d === lower(root) ? root : d)
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
    // Bash may have changed files too: list the open folders and read git again.
    await relist($)
    scheduleGit($)
    return r
  }).catch(async ($, e, next) => {
    $.ui.log(`filetrail: turn.complete failed: ${String(next.error)}`)
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
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
                  const isOpen = (await read($, files)).expanded.includes(k)
                  await update($, files, f => ({ ...f, expanded: isOpen ? f.expanded.filter(d => d !== k) : [...f.expanded, k] }))
                  if (!isOpen && !(k in (await read($, listing)))) await listDir($, dir.path)
                }),
                select: file => fire($, 'selecting a file', () => update($, files, f => ({ ...f, selected: file.path }))),
                history: path => fire($, 'showing history', async () => {
                  await update($, view, () => ({ turn: null, file: path, step: 0 }))
                  await update($, tab, () => 'history')
                }),
              })
            : historyView(els, turnsAll, await read($, view), {
                set: v => fire($, 'moving in history', () => update($, view, () => v)),
                ask: (step, turn) => fire($, 'asking Claude', () => askAbout($, step, turn)),
                exportAll: () => fire($, 'exporting', async () => $.ui.toast(await exportHistory($))),
                close: () => fire($, 'closing the pane', () => $.ui.close({ id: PANE })),
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
