// The History tab: a timeline of turns, one turn's steps, or one file's steps
// across turns, each step drawn as a diff with Prev and Next.

import type { EngineInterface } from 'claude-code'

import type { DiffLine, HistoryView, Step, Turn } from '../types'
import { TONE_SHIMMER } from './files-view'
import { clip, formatAt, keepIndent, NARROW_COLUMNS, NBSP, splitPath, WIDE_COLUMNS } from './paths'

export { formatAt }
import { rowPresses } from './presses'
import type { RowProps, Seg } from './row'

/** A saved turn's time: a blue that reads on light and dark backgrounds alike. */
export const TIME_COLOR = '#60a5fa'

type Els = ReturnType<EngineInterface['ui']['resolve']>

export const TIMELINE: HistoryView = { turn: null, file: null, step: 0 }

export function summarize(turn: Turn): { files: number; edits: number; add: number; del: number; problems: number } {
  let add = 0
  let del = 0
  let problems = 0
  for (const s of turn.steps) {
    add += s.add
    del += s.del
    if (s.status === 'denied' || s.status === 'failed') problems++
  }
  return { files: new Set(turn.steps.map(s => s.path.toLowerCase())).size, edits: turn.steps.length, add, del, problems }
}

export function summaryText(turn: Turn): string {
  const s = summarize(turn)
  const parts = [`${s.files} file${s.files === 1 ? '' : 's'}`, `${s.edits} edit${s.edits === 1 ? '' : 's'}`, `+${s.add} -${s.del}`]
  if (s.problems) parts.push(`${s.problems} not applied`)
  return parts.join(' · ')
}

export type Placed = { step: Step; turn: Turn }

/** The steps on show for a view: one turn's, or one file's across every turn, oldest first. */
export function stepsOf(turns: readonly Turn[], view: HistoryView): Placed[] {
  if (view.file !== null) {
    const want = view.file.toLowerCase()
    return turns.flatMap(turn => turn.steps.filter(s => s.path.toLowerCase() === want).map(step => ({ step, turn })))
  }
  const turn = turns.find(t => t.id === view.turn)
  return turn ? turn.steps.map(step => ({ step, turn })) : []
}

/** Line numbers beside each diff line: old numbers for kept and removed lines, new ones for added. */
export function gutter(diff: readonly DiffLine[], start: number | null): string[] {
  if (start === null) return diff.map(() => '')
  let oldNo = start
  let newNo = start
  let known = true
  return diff.map(l => {
    if (l.op === '~') { known = false; return '' }
    if (!known) return ''
    if (l.op === ' ') { newNo++; return String(oldNo++) }
    if (l.op === '-') return String(oldNo++)
    return String(newNo++)
  })
}

/** '' for an applied step; a step with no answer yet is still running while its turn is live. */
export function statusLabel(step: Step, isLive = false): string {
  if (step.status === 'ok') return ''
  if (step.status === 'pending') return isLive ? 'running…' : 'no answer'
  return step.status
}

/** A turn's title: "Now" while it runs, its time once saved. */
export function turnTitle(turn: Turn, now: number, liveId: string | null): string {
  return `${turn.id === liveId ? 'Now' : formatAt(turn.at, now)}  ${turn.prompt || '(no prompt)'}`
}

/** Diff lines a step shows before Show all; a longer diff folds there (Replay Theater kept 12). */
export const FOLD_LINES = 20

/**
 * One diff line as drawn: the gutter and mark in non-breaking spaces so they keep
 * their columns, the code with its indentation kept but free to wrap at single spaces.
 * (Every space non-breaking cut long lines off in a narrow dock; plain spaces lose
 * the indentation, which the desktop collapses.)
 */
export function diffLineText(l: DiffLine, num: string, gutterWidth: number): string {
  const mark = l.op === '~' ? ' ' : l.op
  const prefix = `${gutterWidth ? num.padStart(gutterWidth) + ' ' : ''}${mark} `.replace(/ /g, NBSP)
  return prefix + keepIndent(l.t)
}

function diffRows(els: Els, step: Step, max = Infinity) {
  const { Text } = els
  if (!step.diff.length) return [<Text dimColor>  (no line changes)</Text>]
  const nums = gutter(step.diff, step.line)
  const w = Math.max(0, ...nums.map(n => n.length))
  return step.diff.slice(0, max).map((l, k) => {
    const color = l.op === '+' ? 'success' : l.op === '-' ? 'error' : undefined
    return <Text mono wrap="wrap" dimColor={l.op === ' ' || l.op === '~'} {...(color ? { color } : {})}>{diffLineText(l, nums[k]!, w)}</Text>
  })
}

export type HistoryActions = {
  set: (v: HistoryView) => void
  /** Shows a path in the Files tab, selected. */
  reveal: (path: string) => void
  /** Shows the file in the pane, at the page holding a line. */
  view: (path: string, line: number | null) => void
  /** Quotes a step into the prompt box for the person to ask about. */
  ask: (step: Step, turn: Turn) => void
  /** Writes the project's whole history to a Markdown file. */
  exportAll: () => void
  /** Closes the pane. */
  close: () => void
}

/** How History fits the pane: narrow (filename-first, shorter titles), normal, or wide (list and diff side by side). */
export type Layout = { width: number; narrow: boolean; wide: boolean }

export function layoutFor(width: number): Layout {
  return { width, narrow: width < NARROW_COLUMNS, wide: width >= WIDE_COLUMNS }
}

type ListOptions = { selected: string | null; width: number; narrow: boolean }

/**
 * A turn's title as coloured runs: the marker when selected, the time in blue (or
 * "Now", shimmering as a write does, while it runs), then the prompt, cut to `budget`
 * characters in all.
 */
export function titleSegs(turn: Turn, now: number, liveId: string | null, selected: boolean, budget: number): Seg[] {
  const isLive = turn.id === liveId
  const when = isLive ? 'Now' : formatAt(turn.at, now)
  const segs: Seg[] = []
  if (selected) segs.push({ t: '› ', c: 'claude', b: true })
  segs.push(isLive ? { t: when, c: 'claude', b: true, sh: TONE_SHIMMER.write } : { t: when, c: TIME_COLOR })
  const lead = segs.reduce((n, s) => n + s.t.length, 0) + 2
  segs.push({ t: NBSP + NBSP + clip(turn.prompt || '(no prompt)', Math.max(8, budget - lead)), ...(isLive || selected ? { b: true } : {}) })
  return segs
}

/** A turn's summary as coloured runs: counts dim, lines added green, removed red, edits not applied yellow. */
function summaryLine(els: Els, turn: Turn, isLive: boolean) {
  const { Text } = els
  const s = summarize(turn)
  return (
    <Text wrap="wrap">
      {isLive ? <Text color="claude">working · </Text> : null}
      <Text dimColor>{`${s.files} file${s.files === 1 ? '' : 's'} · ${s.edits} edit${s.edits === 1 ? '' : 's'} · `}</Text>
      <Text color="success">{`+${s.add}`}</Text>
      <Text dimColor> </Text>
      <Text color="error">{`-${s.del}`}</Text>
      {s.problems ? <Text color="warning">{` · ${s.problems} not applied`}</Text> : null}
    </Text>
  )
}

function timeline(els: Els, turns: readonly Turn[], actions: HistoryActions, now: number, liveId: string | null, opts: ListOptions) {
  const { Box, Text, Button } = els
  const Client = 'Client' in els ? els.Client : undefined
  const { set } = actions
  const saved = turns.filter(t => t.id !== liveId).length
  // A title gets two lines of the column at most.
  const budget = Math.max(24, opts.width * 2 - 4)
  const title = (turn: Turn) => clip(turnTitle(turn, now, liveId), budget)
  if (!turns.length) {
    return (
      <Box key="timeline" flexDirection="column">
        <Text dimColor>No edits recorded yet.</Text>
        <Text dimColor>Edits Claude makes in this project show here, newest first.</Text>
      </Box>
    )
  }
  return (
    <Box key="timeline" flexDirection="column">
      <Box key="timeline-head" flexDirection="row" flexWrap="wrap" gap={1} marginBottom={1}>
        <Text dimColor>{saved} turn{saved === 1 ? '' : 's'}{liveId ? ' · 1 running' : ''}</Text>
        <Button key="export" label="Export" hotkey="e" dimColor onPress={() => actions.exportAll()} />
      </Box>
      {[...turns].reverse().map(turn => {
        const isLive = turn.id === liveId
        const isSelected = turn.id === opts.selected
        const key = `turn-${turn.id}`
        const open = () => set({ turn: turn.id, file: null, step: 0 })
        const segs = titleSegs(turn, now, liveId, isSelected, budget)
        if (Client) rowPresses.set(key, open)
        return (
          <Box key={`row-${turn.id}`} flexDirection="column" marginBottom={1}>
            {/* A Client, as in the Files tree: a desktop Button drops the colours of the Text in it. */}
            {Client
              ? <Client key={key} module="./row.tsx" width="100%" props={{ segs, wrap: true, hoverAt: segs.length - 1 } satisfies RowProps} />
              : (
                <Button key={key} plain onPress={open}>
                  {isSelected ? '› ' : ''}
                  <Text wrap="wrap" {...(isLive ? { color: 'claude' as const } : {})} {...(isLive || isSelected ? { bold: true } : {})}>{title(turn)}</Text>
                </Button>
              )}
            {summaryLine(els, turn, isLive)}
          </Box>
        )
      })}
    </Box>
  )
}

function stepper(
  els: Els, turns: readonly Turn[], view: HistoryView, actions: HistoryActions, now: number, layout: Layout,
  liveId: string | null,
) {
  const { Box, Text, Button } = els
  const { set } = actions
  const steps = stepsOf(turns, view)
  if (!steps.length) {
    return layout.wide
      ? <Text key="stepper-empty" dimColor>No edits in this turn.</Text>
      : timeline(els, turns, actions, now, liveId, { selected: null, width: layout.width, narrow: layout.narrow })
  }
  const k = Math.max(0, Math.min(view.step, steps.length - 1))
  const { step, turn } = steps[k]!
  // Another step folds its diff again.
  const go = (to: number) => set({ ...view, step: Math.max(0, Math.min(to, steps.length - 1)), full: false })
  const folds = step.diff.length > FOLD_LINES
  const status = statusLabel(step, turn.id === liveId)
  const fileTurns = new Set(steps.map(p => p.turn.id)).size
  const fileName = layout.narrow ? splitPath(steps[0]!.step.rel).name : steps[0]!.step.rel
  const header = view.file !== null
    ? `${fileName} · ${steps.length} edit${steps.length === 1 ? '' : 's'} across ${fileTurns} turn${fileTurns === 1 ? '' : 's'}`
    : clip(turnTitle(turn, now, liveId), Math.max(24, layout.width * 2 - 4))
  const { name, dir } = splitPath(step.rel)

  return (
    <Box key="stepper" flexDirection="column">
      {/* Rows of buttons wrap: a docked pane is narrow, and a row that does not cut its last button off (seen live: Close). */}
      <Box key="nav-top" flexDirection="row" flexWrap="wrap" gap={1}>
        {/* Side by side the turn list is on show, so there is nothing to go back to. */}
        {!layout.wide && <Button key="back" label="◀ Timeline" hotkey="b" dimColor onPress={() => set(TIMELINE)} />}
        {view.file !== null && <Button key="to-turn" label="This turn" hotkey="t" dimColor onPress={() => set({ turn: turn.id, file: null, step: turn.steps.indexOf(step) })} />}
        <Button key="close" label="Close" hotkey="c" role="dismiss" dimColor onPress={() => actions.close()} />
      </Box>
      <Text bold wrap="wrap">{header}</Text>
      <Box key="strip" flexDirection="row" flexWrap="wrap" gap={0}>
        {steps.map((_, n) => (
          <Button key={`cell-${n}`} plain {...(n === k ? {} : { dimColor: true })} onPress={() => go(n)}>{n === k ? `[${n + 1}]` : ` ${n + 1} `}</Button>
        ))}
      </Box>
      <Text bold>step {k + 1} of {steps.length}</Text>
      <Box key="file-row" flexDirection="row" flexWrap="wrap" gap={2}>
        {/* Narrow, the file name leads: a path cut at the end loses the part that matters. */}
        {layout.narrow
          ? <Button key="file-filter" plain onPress={() => set({ turn: null, file: step.path, step: 0 })}><Text bold>{name}</Text>{dir ? <Text dimColor> {dir}</Text> : null}</Button>
          : <Button key="file-filter" plain onPress={() => set({ turn: null, file: step.path, step: 0 })}>{step.rel}</Button>}
        <Button key="reveal" label="Show in Files" hotkey="o" dimColor onPress={() => actions.reveal(step.path)} />
        <Button key="view-file" label="View file" hotkey="v" dimColor onPress={() => actions.view(step.path, step.line)} />
      </Box>
      <Box key="meta" flexDirection="row" flexWrap="wrap" gap={2}>
        <Text dimColor>{step.tool}{step.note ? ` · ${step.note}` : ''}{step.line !== null ? ` · line ${step.line}` : ''}{view.file !== null ? ` · ${formatAt(turn.at, now)}` : ''}</Text>
        <Text color="success">+{step.add}</Text>
        <Text color="error">-{step.del}</Text>
        {status ? <Text color={step.status === 'denied' ? 'error' : 'warning'}>{status}</Text> : null}
      </Box>
      <Box key="diff" flexDirection="column" marginTop={1}>
        {diffRows(els, step, folds && !view.full ? FOLD_LINES : Infinity)}
        {folds && !view.full && <Button key="show-all" label={`Show all (${step.diff.length - FOLD_LINES} more lines)`} hotkey="s" dimColor onPress={() => set({ ...view, step: k, full: true })} />}
        {folds && view.full && <Button key="show-fewer" label="Show fewer" hotkey="s" dimColor onPress={() => set({ ...view, step: k, full: false })} />}
      </Box>
      <Box key="nav" flexDirection="row" flexWrap="wrap" gap={2} marginTop={1}>
        <Button key="prev" label="◀ Prev" hotkey="p" onPress={() => go(k - 1)} />
        {/* The ring starts on Next, so Enter steps forward as soon as the pane has the keys. */}
        <Button key="next" label="Next ▶" hotkey="n" autoFocus onPress={() => go(k + 1)} />
        <Button key="ask" label="Ask Claude" hotkey="a" dimColor onPress={() => actions.ask(step, turn)} />
      </Box>
    </Box>
  )
}

/** Share of a wide pane the turn list takes; the diff has the rest. */
export const LIST_SHARE = 0.34

/**
 * The History tab's body. Narrow or normal: the timeline, or one turn's (or file's)
 * steps. Wide: both at once, the turn list on the left and on the right the turn
 * picked there, the latest one until something is picked.
 */
export function historyView(
  els: Els, turns: readonly Turn[], view: HistoryView, actions: HistoryActions, now: number, width: number,
  liveId: string | null = null,
) {
  const layout = layoutFor(width)
  const isTimeline = view.turn === null && view.file === null
  if (!layout.wide) {
    return isTimeline
      ? timeline(els, turns, actions, now, liveId, { selected: null, width, narrow: layout.narrow })
      : stepper(els, turns, view, actions, now, layout, liveId)
  }
  const { Box, Text } = els
  const latest = turns.at(-1)?.id ?? null
  const shown: HistoryView = isTimeline && latest ? { turn: latest, file: null, step: 0 } : view
  const listWidth = Math.floor(width * LIST_SHARE)
  return (
    <Box key="wide" flexDirection="row" gap={2}>
      <Box key="wide-list" width={`${Math.round(LIST_SHARE * 100)}%`} flexDirection="column">
        {timeline(els, turns, actions, now, liveId, { selected: shown.file === null ? shown.turn : null, width: listWidth, narrow: listWidth < NARROW_COLUMNS })}
      </Box>
      <Box key="wide-step" flexGrow={1} flexDirection="column">
        {turns.length
          ? stepper(els, turns, shown, actions, now, { ...layout, width: width - listWidth - 2 }, liveId)
          : <Text dimColor>Pick a turn on the left.</Text>}
      </Box>
    </Box>
  )
}
