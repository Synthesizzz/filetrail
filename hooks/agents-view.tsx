// The Agents tab and the card's strip: the session's helpers (subagents), a group per main turn,
// the newest on top. A row each, two lines, set in under the helper that spawned it: a crab in a
// pose for what the helper last did (a desktop's Svg; a glyph where the surface draws none), then
// a marker, its task and how long it has worked; under them a bar for when it worked on its group's
// time axis, so helpers that ran together line up, the model it runs on and how many tools it
// called. A press on the task opens the row to its files (pressed, they show in the pane). The
// strip is the card's short form: the helpers at work, and a press opens the tab.
// (No name here is `h`: JSX compiles against a global `h`, which a parameter would hide.)

import type { EngineInterface } from 'claude-code'

import type { Helper } from '../types'
import { AGENT, crabSvg, GONE } from './crab'
import type { Pose } from './crab'
import { elapsed, nameOf, running, strip } from './helpers'
import { relTo } from './history'
import { svgOf } from './octicons'
import { clockOf, splitPath } from './paths'
import { formatDuration } from './test-runs'

type Els = ReturnType<EngineInterface['ui']['resolve']>

const DONE_COLOR = '#22c55e'
/** Files a row lists once it is open, before "+N more". */
export const CARD_FILES = 6
/** Rows that get a drawn crab: every one is an Svg the engine scrubs on each draw, so the rest keep a glyph. */
export const CRABS_MAX = 8
/** One cell of the time bar. */
const BAR = '━'
/** A cell of the axis before a helper started or after it ended. */
const IDLE = '·'
/** Before a row's task: closed, and open to its files. */
const CLOSED = '▸ '
const OPENED = '▾ '
/** The most cells a bar has: the model and the calls share its line. */
const BAR_MAX = 18

export type AgentsActions = {
  /** Shows a file in the pane (the Files tab, the file open). */
  view: (path: string) => void
  /** Opens a helper's row to its files, or closes it. */
  toggle: (id: string) => void
}

const LOOK: Record<Helper['state'], { glyph: string; word: string; color: string }> = {
  running: { glyph: '◐', word: 'working', color: AGENT },
  done: { glyph: '✓', word: 'done', color: DONE_COLOR },
  failed: { glyph: '✗', word: 'failed', color: GONE },
}

/** The crab's pose for a helper: cheering when done, sweating when failed, else reading or writing as its last file says (thinking before the first). */
export function crabPose(mate: Helper): Pose {
  if (mate.state === 'done') return 'passed'
  if (mate.state === 'failed') return 'failed'
  const last = mate.files[mate.files.length - 1]
  return last ? (last.tone === 'write' ? 'write' : 'read') : 'think'
}

/**
 * A helper's span on its group's axis, in cells: `lead` before it started, `on` while it worked,
 * `tail` after it ended. At least one cell on, at least four in all; an axis of no length is all on.
 */
export function ganttCells(start: number, end: number, axisStart: number, axisEnd: number, cells: number): { lead: number; on: number; tail: number } {
  const total = Math.max(4, Math.floor(cells))
  const span = axisEnd - axisStart
  if (span <= 0) return { lead: 0, on: total, tail: 0 }
  const at = (t: number) => Math.round(((t - axisStart) / span) * total)
  const lead = Math.min(total - 1, Math.max(0, at(start)))
  const stop = Math.min(total, Math.max(lead + 1, at(end)))
  return { lead, on: stop - lead, tail: total - stop }
}

const FAMILY = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d{1,2})(?!\d)(?:[-.](\d{1,2})(?!\d))?)?/
/** Model names past this length are cut. */
const MODEL_MAX = 16

/** A model id as a person says it: `claude-haiku-5-5` is "Haiku 5.5", the alias `haiku` "Haiku"; anything else cut short, '' for none. */
export function modelName(id: string | undefined): string {
  if (!id) return ''
  const m = FAMILY.exec(id.toLowerCase())
  if (!m) return id.length > MODEL_MAX ? id.slice(0, MODEL_MAX - 1) + '…' : id
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
  return m[2] ? `${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : family
}

/** A group of the tab: the helpers of one main turn (`turn` absent for those the engine's list gave back), each at its depth under the one that spawned it. */
export type HelperGroup = { turn?: string; rows: { mate: Helper; depth: number }[] }

/**
 * The tab's groups: one per main turn, the newest on top, those with no turn last. A helper goes
 * under the one that spawned it (in its group, whatever turn it was spawned in), the rest by when
 * they started. A parent that is not listed, or a loop of parents, leaves a helper on its own.
 */
export function grouped(list: readonly Helper[]): HelperGroup[] {
  const byId = new Map(list.map(m => [m.id, m]))
  const up = (m: Helper) => (m.parentId && m.parentId !== m.id ? byId.get(m.parentId) : undefined)
  const inLoop = (m: Helper) => {
    let cur = up(m)
    for (let k = 0; cur && k <= list.length; k++, cur = up(cur)) if (cur.id === m.id) return true
    return false
  }
  const parentOf = new Map(list.map(m => [m.id, inLoop(m) ? undefined : up(m)]))
  const kids = new Map<string, Helper[]>()
  const roots: Helper[] = []
  for (const m of list) {
    const p = parentOf.get(m.id)
    if (p) kids.set(p.id, [...(kids.get(p.id) ?? []), m])
    else roots.push(m)
  }
  const byStart = (a: Helper, b: Helper) => a.startedAt - b.startedAt
  const groups = new Map<string, HelperGroup>()
  for (const root of [...roots].sort(byStart)) {
    const key = root.turn ?? ''
    const group = groups.get(key) ?? { ...(root.turn ? { turn: root.turn } : {}), rows: [] }
    const walk = (m: Helper, depth: number) => {
      group.rows.push({ mate: m, depth })
      for (const k of [...(kids.get(m.id) ?? [])].sort(byStart)) walk(k, depth + 1)
    }
    walk(root, 0)
    groups.set(key, group)
  }
  const first = (g: HelperGroup) => Math.min(...g.rows.map(r => r.mate.startedAt))
  return [...groups.values()].sort((a, b) => (!a.turn !== !b.turn ? (a.turn ? -1 : 1) : first(b) - first(a)))
}

/**
 * What follows the bar on a row's second line: the model it runs on, "failed" when it failed, how
 * many tools it called ("starting" before the first). How long sits on the first line; the file it
 * is on shows once the row is open; done is the bar's colour and the crab's pose.
 * Spaces inside a fact are no-break, so a narrow pane wraps the line between facts only.
 */
export function factsOf(mate: Helper): string {
  const calls = mate.calls ? `${mate.calls} call${mate.calls === 1 ? '' : 's'}` : mate.state === 'running' ? 'starting' : ''
  return [
    modelName(mate.model),
    mate.state === 'failed' ? LOOK.failed.word : '',
    calls,
  ].filter(Boolean).map(fact => fact.replace(/ /g, '\u00a0')).join(' · ')
}

/** "3 calls · 2 files": what a helper has done, '' for nothing yet. */
export function doneText(mate: Helper): string {
  const parts = [
    mate.calls ? `${mate.calls} call${mate.calls === 1 ? '' : 's'}` : '',
    mate.files.length ? `${mate.files.length} file${mate.files.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** The tab's button label: "Agents", with how many work, or how many there were. */
export function tabLabel(list: readonly Helper[]): string {
  const at = running(list).length
  return at ? `Agents ${at}` : list.length ? `Agents · ${list.length}` : 'Agents'
}

/** The card's strip: the helpers at work (two named), a press opens the Agents tab; null when none works. */
export function helperStrip(els: Els, list: readonly Helper[], open: () => void) {
  const { Box, Button } = els
  const { shown, more } = strip(list)
  if (!shown.length) return null
  return (
    <Box key="helper-strip" flexDirection="column" minWidth={0}>
      {shown.map(mate => <Button key={`strip-${mate.id}`} label={`◐ ${nameOf(mate, 24)}${mate.calls ? ` · ${mate.calls}` : ''}`} plain dimColor onPress={open} />)}
      {more > 0 ? <Button key="strip-more" label={`+${more} more helper${more === 1 ? '' : 's'}`} plain dimColor onPress={open} /> : null}
    </Box>
  )
}

/** A folder as its last two names, "…/Temp/claude", '' for none. */
function nearby(dir: string): string {
  const parts = dir.split('/').filter(Boolean)
  if (!parts.length) return ''
  return (parts.length > 2 ? '…/' : '') + parts.slice(-2).join('/')
}

/** The levels a helper's row is set in under the one that spawned it; deeper ones stay at the last. */
export const DEPTH_MAX = 2

/** What goes before a row set in under its parent: two cells a level, then "└ ", '' at the top. */
export function indentOf(depth: number): string {
  const d = Math.min(DEPTH_MAX, Math.max(0, depth))
  return d ? '  '.repeat(d - 1) + '└ ' : ''
}

/** What a row needs beyond the helper: its group's axis, the cells its bar has, how deep it is set. */
type Ctx = { now: number; root: string; axis: { start: number; end: number }; cells: number; depth: number; open: boolean; crab: boolean; actions: AgentsActions }

/** One helper's row: crab; marker, task and how long; its span on the group's axis with the model and calls; its files under them once opened. */
function row(els: Els, mate: Helper, c: Ctx) {
  const { Box, Text, Button } = els
  const Svg = svgOf(els)
  const look = LOOK[mate.state]
  const task = mate.description || mate.type
  const shown = mate.files.slice(-CARD_FILES).reverse()
  const more = mate.files.length - shown.length
  const bar = ganttCells(mate.startedAt, mate.endedAt ?? c.now, c.axis.start, c.axis.end, c.cells)
  const pose = crabPose(mate)
  const art = Svg && c.crab ? crabSvg(pose, `Crab ${look.word}: ${task}`, { wear: true }) : null
  const indent = indentOf(c.depth)
  const facts = factsOf(mate)
  return (
    <Box key={`agent-${mate.id}`} flexDirection="row" gap={1} alignItems="flex-start" minWidth={0} overflow="hidden">
      {indent ? <Text key={`indent-${mate.id}`} mono dimColor>{indent}</Text> : null}
      {Svg && art
        ? <Svg key={`crab-${mate.id}`} source={art.source} alt={art.alt} width={art.width} height={art.height} />
        : <Text key={`mark-${mate.id}`} color={look.color}>{look.glyph}</Text>}
      <Box key="text" flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Box key="top" flexDirection="row" gap={1} minWidth={0}>
          <Box key="task" flexGrow={1} flexShrink={1} minWidth={0}>
            <Button key={`agent-head-${mate.id}`} plain onPress={() => c.actions.toggle(mate.id)}>
              <Text dimColor>{c.open ? OPENED : CLOSED}</Text>
              <Text weight="semibold">{task}</Text>
            </Button>
          </Box>
          <Text key="took" dimColor>{formatDuration(elapsed(mate, c.now))}</Text>
        </Box>
        <Box key="under" flexDirection="row" gap={1} minWidth={0}>
          <Text key="bar" mono><Text dimColor>{IDLE.repeat(bar.lead)}</Text><Text color={look.color}>{BAR.repeat(bar.on)}</Text><Text dimColor>{IDLE.repeat(bar.tail)}</Text></Text>
          {facts ? <Text key="facts" dimColor wrap="wrap">{facts}</Text> : null}
        </Box>
        {c.open ? (
          <Box key="files" flexDirection="column" marginTop={1}>
            <Text key="kind" dimColor>{`${mate.type}${mate.files.length ? ` · ${mate.files.length} file${mate.files.length === 1 ? '' : 's'}` : ' · no files yet'}`}</Text>
            {shown.map(f => {
              const at = splitPath(relTo(c.root, f.path))
              return (
                <Button key={`file-${mate.id}-${f.path}`} plain onPress={() => c.actions.view(f.path)}>
                  <Text color={f.tone === 'write' ? '#d97757' : '#8b5cf6'}>{f.tone === 'write' ? '✎ ' : '◉ '}</Text>{at.name}{at.dir ? <Text dimColor>{` ${nearby(at.dir)}`}</Text> : null}
                </Button>
              )
            })}
            {more > 0 ? <Text key="more" dimColor>{`+${more} more file${more === 1 ? '' : 's'}`}</Text> : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

/** A group's axis: from its first helper's start to its last one's end (or now, while one works). */
export function axisOf(group: HelperGroup, now: number): { start: number; end: number } {
  const start = Math.min(...group.rows.map(r => r.mate.startedAt))
  const end = Math.max(start, ...group.rows.map(r => r.mate.endedAt ?? now))
  return { start, end }
}

/** A group's head: "Turn 10:05 · 3 helpers · 1 working · 2m 40s" ("N working" while any does), or "Earlier · …" for those with no turn. */
export function groupHead(group: HelperGroup, now: number): string {
  const axis = axisOf(group, now)
  const n = group.rows.length
  const at = group.rows.filter(r => r.mate.state === 'running').length
  return `${group.turn ? `Turn ${clockOf(axis.start)}` : 'Earlier'} · ${n} helper${n === 1 ? '' : 's'}${at ? ` · ${at} working` : ''} · ${formatDuration(axis.end - axis.start)}`
}

/** The Agents tab: a group per main turn, the newest on top, a row per helper on the group's time axis; a line saying so when there are none. `opened` are the helpers whose files show. */
export function agentsView(els: Els, list: readonly Helper[], now: number, root: string, actions: AgentsActions, opened: readonly string[] = [], columns = 36) {
  const { Box, Text } = els
  if (!list.length) {
    return (
      <Box key="agents" flexDirection="column" gap="sm">
        <Text key="none" dimColor wrap="wrap">No helpers yet. When Claude starts a subagent, it shows here with what it reads and writes.</Text>
      </Box>
    )
  }
  // The crab takes about four cells, with the gap; the bar takes under half of what is left, less a
  // row's indent, so the model and the calls fit beside it.
  const cells = (depth: number) => Math.min(BAR_MAX, Math.max(6, Math.floor((columns - 6 - indentOf(depth).length - (depth ? 1 : 0)) * 0.45)))
  let n = 0
  return (
    <Box key="agents" flexDirection="column" gap="sm">
      {grouped(list).map(group => {
        const axis = axisOf(group, now)
        return (
          <Box key={`group-${group.turn ?? 'earlier'}`} flexDirection="column" gap="sm" minWidth={0}>
            <Text key="head" weight="semibold" dimColor wrap="truncate-end">{groupHead(group, now)}</Text>
            {group.rows.map(({ mate, depth }) => row(els, mate, { now, root, axis, cells: cells(depth), depth, open: opened.includes(mate.id), crab: n++ < CRABS_MAX, actions }))}
          </Box>
        )
      })}
    </Box>
  )
}
