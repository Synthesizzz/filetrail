// The Agents tab and the card's strip: the session's helpers (subagents), those at work first.
// A card each: its type and task, how it stands, how long it has worked, how many tools it
// called, and the files it read or wrote (pressed, they open in the pane). The strip is the
// card's short form: the helpers at work, and a press opens the tab.
// (No name here is `h`: JSX compiles against a global `h`, which a parameter would hide.)

import type { EngineInterface } from 'claude-code'

import type { Helper } from '../types'
import { AGENT, GONE } from './crab'
import { elapsed, nameOf, running, strip } from './helpers'
import { relTo } from './history'
import { formatDuration } from './test-runs'

type Els = ReturnType<EngineInterface['ui']['resolve']>

const DONE_COLOR = '#22c55e'
/** Files a card lists before "+N more". */
export const CARD_FILES = 6

export type AgentsActions = {
  /** Shows a file in the pane (the Files tab, the file open). */
  view: (path: string) => void
}

const LOOK: Record<Helper['state'], { glyph: string; word: string; color: string }> = {
  running: { glyph: '◐', word: 'working', color: AGENT },
  done: { glyph: '✓', word: 'done', color: DONE_COLOR },
  failed: { glyph: '✗', word: 'failed', color: GONE },
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
      {shown.map(mate => <Button key={`strip-${mate.id}`} label={`◐ ${nameOf(mate, 30)}${mate.calls ? ` · ${mate.calls}` : ''}`} plain dimColor onPress={open} />)}
      {more > 0 ? <Button key="strip-more" label={`+${more} more helper${more === 1 ? '' : 's'}`} plain dimColor onPress={open} /> : null}
    </Box>
  )
}

/** One helper's card. */
function card(els: Els, mate: Helper, now: number, root: string, actions: AgentsActions) {
  const { Box, Text, Button } = els
  const look = LOOK[mate.state]
  const facts = [look.word, formatDuration(elapsed(mate, now)), doneText(mate)].filter(Boolean).join(' · ')
  const shown = mate.files.slice(-CARD_FILES).reverse()
  const more = mate.files.length - shown.length
  return (
    <Box key={`agent-${mate.id}`} flexDirection="column" borderStyle="round" borderColor={look.color} paddingX={1} minWidth={0} overflow="hidden">
      <Text key="head" weight="semibold" wrap="wrap">
        <Text color={look.color}>{`${look.glyph} `}</Text>{mate.type}{mate.description ? <Text dimColor>{` · ${mate.description}`}</Text> : null}
      </Text>
      <Text key="facts" dimColor wrap="wrap">{facts}</Text>
      {shown.map(f => (
        <Button key={`file-${mate.id}-${f.path}`} label={`${f.tone === 'write' ? '✎' : '◉'} ${relTo(root, f.path)}`} plain onPress={() => actions.view(f.path)} />
      ))}
      {more > 0 ? <Text key="more" dimColor>{`+${more} more file${more === 1 ? '' : 's'}`}</Text> : null}
    </Box>
  )
}

/** The Agents tab: a card per helper, those at work first; a line saying so when there are none. */
export function agentsView(els: Els, list: readonly Helper[], now: number, root: string, actions: AgentsActions) {
  const { Box, Text } = els
  if (!list.length) {
    return (
      <Box key="agents" flexDirection="column" gap="sm">
        <Text key="none" dimColor wrap="wrap">No helpers yet. When Claude starts a subagent, it shows here with what it reads and writes.</Text>
      </Box>
    )
  }
  const at = running(list).length
  return (
    <Box key="agents" flexDirection="column" gap="sm">
      <Text key="summary" dimColor>{`${list.length} helper${list.length === 1 ? '' : 's'} this session${at ? ` · ${at} working` : ''}`}</Text>
      {ordered(list).map(mate => card(els, mate, now, root, actions))}
    </Box>
  )
}
