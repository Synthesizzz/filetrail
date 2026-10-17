// The History tab: a timeline of turns, one turn's steps, or one file's steps
// across turns, each step drawn as a diff with Prev and Next.

import type { EngineInterface } from 'claude-code'

import type { DiffLine, HistoryView, Step, Turn } from '../types'
import { NBSP } from './files-view'

type Els = ReturnType<EngineInterface['ui']['resolve']>

export const TIMELINE: HistoryView = { turn: null, file: null, step: 0 }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "17:05" today, "Oct 16 17:05" on another day, in the machine's local time. */
export function formatAt(at: number, now: number): string {
  const d = new Date(at)
  const n = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? hm : `${MONTHS[d.getMonth()]} ${d.getDate()} ${hm}`
}

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

export function statusLabel(step: Step): string {
  return step.status === 'ok' ? '' : step.status === 'pending' ? 'no answer' : step.status
}

function diffRows(els: Els, step: Step, width: number) {
  const { Text } = els
  if (!step.diff.length) return [<Text dimColor>  (no line changes)</Text>]
  const nums = gutter(step.diff, step.line)
  const w = Math.max(0, ...nums.map(n => n.length))
  return step.diff.map((l, k) => {
    const color = l.op === '+' ? 'success' : l.op === '-' ? 'error' : undefined
    const mark = l.op === '~' ? ' ' : l.op
    // Non-breaking spaces: the desktop collapses runs of plain ones, which would flatten the code's indentation.
    const line = `${w ? nums[k]!.padStart(w) + ' ' : ''}${mark} ${l.t}`.slice(0, Math.max(20, width)).replace(/ /g, NBSP)
    return <Text mono wrap="truncate-end" dimColor={l.op === ' ' || l.op === '~'} {...(color ? { color } : {})}>{line}</Text>
  })
}

export type HistoryActions = {
  set: (v: HistoryView) => void
  /** Shows a path in the Files tab, selected. */
  reveal: (path: string) => void
  /** Quotes a step into the prompt box for the person to ask about. */
  ask: (step: Step, turn: Turn) => void
  /** Writes the project's whole history to a Markdown file. */
  exportAll: () => void
}

function timeline(els: Els, turns: readonly Turn[], actions: HistoryActions, now: number) {
  const { Box, Text, Button } = els
  const { set } = actions
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
      <Box key="timeline-head" flexDirection="row" gap={1} marginBottom={1}>
        <Text dimColor>{turns.length} turn{turns.length === 1 ? '' : 's'}</Text>
        <Button key="export" label="Export" hotkey="e" dimColor onPress={() => actions.exportAll()} />
      </Box>
      {[...turns].reverse().map(turn => (
        <Box key={`row-${turn.id}`} flexDirection="column" marginBottom={1}>
          <Button key={`turn-${turn.id}`} plain onPress={() => set({ turn: turn.id, file: null, step: 0 })}>
            {formatAt(turn.at, now)}  {turn.prompt || '(no prompt)'}
          </Button>
          <Text dimColor>{summaryText(turn)}</Text>
        </Box>
      ))}
    </Box>
  )
}

function stepper(els: Els, turns: readonly Turn[], view: HistoryView, actions: HistoryActions, now: number, width: number) {
  const { Box, Text, Button } = els
  const { set } = actions
  const steps = stepsOf(turns, view)
  if (!steps.length) return timeline(els, turns, actions, now)
  const k = Math.max(0, Math.min(view.step, steps.length - 1))
  const { step, turn } = steps[k]!
  const go = (to: number) => set({ ...view, step: Math.max(0, Math.min(to, steps.length - 1)) })
  const status = statusLabel(step)
  const header = view.file !== null
    ? `${steps[0]!.step.rel} · ${steps.length} edit${steps.length === 1 ? '' : 's'} across ${new Set(steps.map(p => p.turn.id)).size} turn(s)`
    : `${formatAt(turn.at, now)}  ${turn.prompt || '(no prompt)'}`

  return (
    <Box key="stepper" flexDirection="column">
      <Box key="nav-top" flexDirection="row" gap={1}>
        <Button key="back" label="◀ Timeline" hotkey="b" dimColor onPress={() => set(TIMELINE)} />
        {view.file !== null && <Button key="to-turn" label="This turn" hotkey="t" dimColor onPress={() => set({ turn: turn.id, file: null, step: turn.steps.indexOf(step) })} />}
      </Box>
      <Text bold wrap="truncate-end">{header}</Text>
      <Box key="strip" flexDirection="row" gap={0}>
        {steps.map((_, n) => (
          <Button key={`cell-${n}`} plain {...(n === k ? {} : { dimColor: true })} onPress={() => go(n)}>{n === k ? `[${n + 1}]` : ` ${n + 1} `}</Button>
        ))}
      </Box>
      <Text bold>step {k + 1} of {steps.length}</Text>
      <Box key="file-row" flexDirection="row" gap={2}>
        <Button key="file-filter" plain onPress={() => set({ turn: null, file: step.path, step: 0 })}>{step.rel}</Button>
        <Button key="reveal" label="Show in Files" hotkey="o" dimColor onPress={() => actions.reveal(step.path)} />
      </Box>
      <Box key="meta" flexDirection="row" gap={2}>
        <Text dimColor>{step.tool}{step.note ? ` · ${step.note}` : ''}{step.line !== null ? ` · line ${step.line}` : ''}{view.file !== null ? ` · ${formatAt(turn.at, now)}` : ''}</Text>
        <Text color="success">+{step.add}</Text>
        <Text color="error">-{step.del}</Text>
        {status ? <Text color={step.status === 'denied' ? 'error' : 'warning'}>{status}</Text> : null}
      </Box>
      <Box key="diff" flexDirection="column" marginTop={1}>
        {diffRows(els, step, width)}
      </Box>
      <Box key="nav" flexDirection="row" gap={2} marginTop={1}>
        <Button key="prev" label="◀ Prev" hotkey="p" onPress={() => go(k - 1)} />
        <Button key="next" label="Next ▶" hotkey="n" onPress={() => go(k + 1)} />
        <Button key="ask" label="Ask Claude" hotkey="a" dimColor onPress={() => actions.ask(step, turn)} />
      </Box>
    </Box>
  )
}

/** The History tab's body for the view on show. */
export function historyView(els: Els, turns: readonly Turn[], view: HistoryView, actions: HistoryActions, now: number, width: number) {
  return view.turn === null && view.file === null
    ? timeline(els, turns, actions, now)
    : stepper(els, turns, view, actions, now, width)
}
