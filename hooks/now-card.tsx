// The "Right now" card at the top of the Files tab: what Claude is doing this moment
// (reading, editing, committing a file, pushing, merging), or that it is idle and what it
// touched last.
// Below it, the files Claude touched this session. A bordered card and a pill with a
// background draw on the desktop (seen live); the crab beside the words is an Svg.

import type { EngineInterface, RenderElement } from 'claude-code'

import type { Entry, GitPose, GitStage, Tone } from '../types'
import { relTo } from './history'
import { splitPath } from './paths'
import { crabSvg, CRAB_ROWS, GONE, MERGE, PUSH } from './crab'
import { lower } from './tree'
import { svgOf } from './octicons'

type Els = ReturnType<EngineInterface['ui']['resolve']>

/** Each tone's word, glyph and colours: the text, and a faint fill behind the icon and the pill. */
export const NOW_STYLE: Record<Tone, { doing: string; did: string; pill: string; glyph: string; color: string; fill: string }> = {
  read: { doing: 'reading', did: 'read', pill: 'Reading', glyph: '◉', color: '#8b5cf6', fill: '#8b5cf633' },
  write: { doing: 'editing', did: 'edited', pill: 'Editing', glyph: '✎', color: '#d97757', fill: '#d9775733' },
  commit: { doing: 'committing', did: 'committed', pill: 'Committed', glyph: '✓', color: '#22c55e', fill: '#22c55e33' },
  delete: { doing: 'deleting', did: 'deleted', pill: 'Deleted', glyph: '✕', color: GONE, fill: `${GONE}33` },
}
const IDLE = { glyph: '◌', color: '#808a96', fill: '#808a9622' }
/** A push's and a merge's words and colours, the git bar's (sync teal, merge purple): running, then done. */
export const STAGE_STYLE: Record<GitPose, { running: string; done: string; color: string; fill: string }> = {
  push: { running: 'Pushing', done: 'Pushed', color: PUSH, fill: `${PUSH}33` },
  merge: { running: 'Merging', done: 'Merged', color: MERGE, fill: `${MERGE}33` },
}

/** A path as the tree spells it: `last` keeps it lower-cased, the listing has the real spelling. */
export function spelled(listing: Readonly<Record<string, Entry[]>>, path: string): string {
  const want = lower(path)
  for (const entries of Object.values(listing)) for (const e of entries) if (lower(e.path) === want) return e.path
  return path
}

export function nowCard(
  els: Els, root: string, listing: Readonly<Record<string, Entry[]>>,
  last: { path: string; tone: Tone } | null, flash: Readonly<Record<string, Tone>>,
  sections: readonly RenderElement[] = [],
  header: readonly RenderElement[] = [],
  narrow = false,
  stage: GitStage | null = null,
) {
  const { Box, Text } = els
  const Svg = svgOf(els)
  const active = last ? flash[last.path] : undefined
  const where = last ? splitPath(relTo(root, spelled(listing, last.path))) : null
  // A push or a merge running, or just done, comes before the file Claude is on: the crab
  // acts it out, the pill says it, and the line names what it went to (a branch, a remote).
  const git = stage ? STAGE_STYLE[stage.pose] : null
  const style = git && stage
    ? { pill: stage.state === 'running' ? git.running : git.done, doing: (stage.state === 'running' ? git.running : git.done).toLowerCase(), color: git.color, fill: git.fill, name: stage.target, dir: '' }
    : active && where ? { ...NOW_STYLE[active], name: where.name, dir: where.dir } : null
  const icon = style ?? IDLE
  const crab = crabSvg(stage ? stage.pose : active ?? 'idle', style ? `Crab ${style.doing}${style.name ? ` ${style.name}` : ''}` : 'Crab asleep: Claude is idle')
  return (
    // minWidth 0 lets the card shrink with the pane; what still does not fit is clipped
    // at its border, never drawn past it (seen live: a long name ran out of the card).
    <Box key="now-card" flexDirection="column" gap="sm" borderStyle="round" borderColor={style ? style.color : IDLE.color} paddingX={1} minWidth={0} overflow="hidden">
    {/* The card's title bar: the folder, its toolbar, the branch and git as chips. */}
    {header}
    {/* One line, kept short so the tree below keeps the room (seen live: three lines and a
        large crab took much of the pane): the crab, what Claude does, the file, its folder. */}
    <Box key="now-row" flexDirection="row" gap={1} alignItems="flex-start" minWidth={0}>
      {/* The crab, in a pose for what Claude is doing; blocks where the surface has no Svg. */}
      {Svg
        ? <Svg source={crab.source} alt={crab.alt} width={crab.width} height={crab.height} />
        : <Text color={icon.color}>{CRAB_ROWS[0]}</Text>}
      {/* The line wraps rather than run out of the card; narrow, the pill goes under it, as
          wide as its word (seen live: a column stretched it across the card). */}
      <Box key="now-text" flexDirection="column" alignItems="flex-start" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
        {style
          ? <Text weight="semibold" wrap="wrap">{style.name ? `${style.pill} ` : style.pill}{style.name ? <Text color={style.color}>{style.name}</Text> : null}{style.dir ? <Text dimColor>{` · ${style.dir}`}</Text> : null}</Text>
          : <Text weight="semibold" wrap="wrap">Idle<Text dimColor>{where ? ` · last ${NOW_STYLE[last!.tone].did} ${where.name}` : ' · nothing touched yet'}</Text></Text>}
        {style && narrow ? <Text key="now-pill" color={style.color} backgroundColor={style.fill} weight="semibold">{` ${style.pill} `}</Text> : null}
      </Box>
      {/* The status pill: a Text with a background. */}
      {style && !narrow ? <Text key="now-pill" color={style.color} backgroundColor={style.fill} weight="semibold">{` ${style.pill} `}</Text> : null}
    </Box>
    {/* Below the row: the files Claude touched this session. */}
    {sections}
    </Box>
  )
}
