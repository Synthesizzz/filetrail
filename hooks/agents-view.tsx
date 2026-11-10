// The Agents tab and the card's strip: the session's helpers (subagents), those at work first.
// A row each, short: a crab in a pose for what the helper last did (a desktop's Svg; a glyph
// where the surface draws none), its task, the file it is on, how long it has worked, how many
// tools it called, and a bar for its time next to the longest. A press on the task opens the row
// to its files (pressed, they show in the pane). The strip is the card's short form: the
// helpers at work, and a press opens the tab.
// (No name here is `h`: JSX compiles against a global `h`, which a parameter would hide.)

import type { EngineInterface } from 'claude-code'

import type { Helper } from '../types'
import { AGENT, crabSvg, GONE } from './crab'
import type { Pose } from './crab'
import { elapsed, nameOf, running, strip } from './helpers'
import { relTo } from './history'
import { svgOf } from './octicons'
import { splitPath } from './paths'
import { formatDuration } from './test-runs'

type Els = ReturnType<EngineInterface['ui']['resolve']>

const DONE_COLOR = '#22c55e'
/** Files a row lists once it is open, before "+N more". */
export const CARD_FILES = 6
/** Rows that get a drawn crab: every one is an Svg the engine scrubs on each draw, so the rest keep a glyph. */
export const CRABS_MAX = 8
/** One cell of the time bar. */
const BAR = '━'

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

/** The time bar in cells: a helper's time next to the longest (which fills the bar), at least one cell. */
export function barCells(spent: number, longest: number, cells: number): { on: number; off: number } {
  const total = Math.max(4, Math.floor(cells))
  const on = longest > 0 ? Math.min(total, Math.max(1, Math.round((spent / longest) * total))) : 1
  return { on, off: total - on }
}

/** The row's second line: how it ended (when it has), the file it is on, how long it worked, how many calls. */
export function factsOf(mate: Helper, now: number): string {
  const last = mate.files[mate.files.length - 1]
  const calls = mate.calls ? `${mate.calls} call${mate.calls === 1 ? '' : 's'}` : ''
  return [
    mate.state === 'running' ? '' : LOOK[mate.state].word,
    last ? `${last.tone === 'write' ? '✎' : '◉'} ${splitPath(last.path).name}` : mate.state === 'running' && !mate.calls ? 'starting' : '',
    formatDuration(elapsed(mate, now)),
    calls,
  ].filter(Boolean).join(' · ')
}

/** "3 calls · 2 files": what a helper has done, '' for nothing yet. */
export function doneText(mate: Helper): string {
  const parts = [
    mate.calls ? `${mate.calls} call${mate.calls === 1 ? '' : 's'}` : '',
    mate.files.length ? `${mate.files.length} file${mate.files.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Those at work first, the newest of each group first. */
export function ordered(list: readonly Helper[]): Helper[] {
  const byNew = [...list].reverse()
  return [...byNew.filter(m => m.state === 'running'), ...byNew.filter(m => m.state !== 'running')]
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

/** What a row needs beyond the helper. */
type Ctx = { now: number; root: string; longest: number; cells: number; open: boolean; crab: boolean; actions: AgentsActions }

/** One helper's row: crab, task, facts, bar; its files under them once opened. */
function row(els: Els, mate: Helper, c: Ctx) {
  const { Box, Text, Button } = els
  const Svg = svgOf(els)
  const look = LOOK[mate.state]
  const task = mate.description || mate.type
  const shown = mate.files.slice(-CARD_FILES).reverse()
  const more = mate.files.length - shown.length
  const bar = barCells(elapsed(mate, c.now), c.longest, c.cells)
  const pose = crabPose(mate)
  const art = Svg && c.crab ? crabSvg(pose, `Crab ${look.word}: ${task}`) : null
  return (
    <Box key={`agent-${mate.id}`} flexDirection="row" gap={1} alignItems="flex-start" minWidth={0} overflow="hidden">
      {Svg && art
        ? <Svg key={`crab-${mate.id}`} source={art.source} alt={art.alt} width={art.width} height={art.height} />
        : <Text key={`mark-${mate.id}`} color={look.color}>{look.glyph}</Text>}
      <Box key="text" flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Button key={`agent-head-${mate.id}`} plain onPress={() => c.actions.toggle(mate.id)}>
          <Text weight="semibold">{task}</Text>
        </Button>
        <Text key="facts" dimColor wrap="wrap">{factsOf(mate, c.now)}</Text>
        <Text key="bar"><Text color={look.color}>{BAR.repeat(bar.on)}</Text><Text dimColor>{BAR.repeat(bar.off)}</Text></Text>
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

/** The Agents tab: a row per helper, those at work first; a line saying so when there are none. `opened` are the helpers whose files show. */
export function agentsView(els: Els, list: readonly Helper[], now: number, root: string, actions: AgentsActions, opened: readonly string[] = [], columns = 36) {
  const { Box, Text } = els
  if (!list.length) {
    return (
      <Box key="agents" flexDirection="column" gap="sm">
        <Text key="none" dimColor wrap="wrap">No helpers yet. When Claude starts a subagent, it shows here with what it reads and writes.</Text>
      </Box>
    )
  }
  const at = running(list).length
  const longest = Math.max(0, ...list.map(m => elapsed(m, now)))
  // The crab takes about four cells, with the gap: the bar fits what is left.
  const cells = Math.min(40, Math.max(6, columns - 6))
  return (
    <Box key="agents" flexDirection="column" gap="sm">
      <Text key="summary" dimColor wrap="wrap">{`${list.length} helper${list.length === 1 ? '' : 's'} this session${at ? ` · ${at} working` : ''}`}</Text>
      {ordered(list).map((mate, i) => row(els, mate, { now, root, longest, cells, open: opened.includes(mate.id), crab: i < CRABS_MAX, actions }))}
    </Box>
  )
}
