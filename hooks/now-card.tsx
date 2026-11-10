// The "Right now" card at the top of the Files tab: what Claude is doing this moment
// (reading, editing, committing a file, pushing, merging, searching, running a command or
// tests, working with a helper, hitting an error, thinking), or that it is idle and what
// it touched last.
// Below it, the files Claude touched this session. A bordered card and a pill with a
// background draw on the desktop (seen live); the crab beside the words is an Svg.

import type { EngineInterface, RenderElement } from 'claude-code'

import type { Entry, Stage, StagePose, TestRuns, Tone } from '../types'
import { relTo } from './history'
import { badgeColors, clockOf, splitPath } from './paths'
import { disagreement, formatDuration, runShown } from './test-runs'
import { AGENT, COMMAND, crabSvg, GONE, MERGE, PUSH, SEARCH, TERM_FRAMES, TEST } from './crab'
import type { Pose } from './crab'
import type { CrabProps } from './crab-client'
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
const PASSED = '#22c55e'
/**
 * Each stage's word while it runs, once done, and when it failed, and its colour (a push
 * and a merge take the git bar's sync teal and merge purple). A failure is red.
 */
export const STAGE_STYLE: Record<StagePose, { running: string; done: string; failed: string; color: string }> = {
  push: { running: 'Pushing', done: 'Pushed', failed: 'Push failed', color: PUSH },
  merge: { running: 'Merging', done: 'Merged', failed: 'Merge failed', color: MERGE },
  search: { running: 'Searching', done: 'Searched', failed: 'Search failed', color: SEARCH },
  command: { running: 'Running', done: 'Ran', failed: 'Command failed', color: COMMAND },
  test: { running: 'Testing', done: 'Tests passed', failed: 'Tests failed', color: TEST },
  agent: { running: 'Helper', done: 'Helper done', failed: 'Helper failed', color: AGENT },
  error: { running: 'Failed', done: 'Failed', failed: 'Failed', color: GONE },
}

/** The card's word, colour and the crab's pose for a stage: tests that ended pass or fail, a failure is red. */
export function stageLook(stage: Stage): { word: string; color: string; pose: Pose } {
  const s = STAGE_STYLE[stage.pose]
  const word = stage.word ?? (stage.state === 'running' ? s.running : stage.state === 'ok' ? s.done : s.failed)
  if (stage.pose === 'test' && stage.state !== 'running') return stage.state === 'ok' ? { word, color: PASSED, pose: 'passed' } : { word, color: GONE, pose: 'failed' }
  return { word, color: stage.state === 'failed' ? GONE : s.color, pose: stage.pose }
}

/** A path as the tree spells it: `last` keeps it lower-cased, the listing has the real spelling. */
export function spelled(listing: Readonly<Record<string, Entry[]>>, path: string): string {
  const want = lower(path)
  for (const entries of Object.values(listing)) for (const e of entries) if (lower(e.path) === want) return e.path
  return path
}

/** The last test run as one line (what ran, when, how long) and, when a per-file and a full run disagree, a warning under it. */
function testLine(els: Els, tests: TestRuns, dismiss?: () => void) {
  const { Box, Text, Button } = els
  const run = tests.last
  const differ = disagreement(tests)
  const shown = runShown(tests)
  if (!shown && !differ) return null
  return (
    <Box key="test-box" flexDirection="column" minWidth={0}>
      {shown ? (
        <Box key="test-row" flexDirection="row" gap={1} minWidth={0}>
          <Box key="test-text" flexShrink={1} flexGrow={1} minWidth={0}>
            <Text key="test-line" wrap="wrap">
              <Text color={run.ok ? PASSED : GONE} weight="semibold">{run.ok ? '✓ passed' : '✗ failed'}</Text>
              <Text dimColor>{` · ${run.command} · ${clockOf(run.at)} · ${formatDuration(run.ms)}`}</Text>
            </Text>
          </Box>
          {dismiss ? <Button key="tests-dismiss" label="×" plain dimColor onPress={dismiss} /> : null}
        </Box>
      ) : null}
      {differ ? <Text key="test-differ" color="warning" wrap="wrap">{`⚠ ${differ}`}</Text> : null}
    </Box>
  )
}

export function nowCard(
  els: Els, root: string, listing: Readonly<Record<string, Entry[]>>,
  last: { path: string; tone: Tone; at?: number } | null, flash: Readonly<Record<string, Tone>>,
  sections: readonly RenderElement[] = [],
  header: readonly RenderElement[] = [],
  narrow = false,
  stage: Stage | null = null,
  /** A main-loop turn is running: with nothing else to show, the crab thinks. */
  working = false,
  /** The session's test runs: the last stays under the row once the chip has gone. */
  tests: TestRuns | null = null,
  /** The helpers at work, as a short strip under the row (null when none works). */
  helpers: RenderElement | null = null,
  /** Puts the last test run's line away until a newer run (the x beside it). */
  dismissTests?: () => void,
) {
  const { Box, Text } = els
  const Svg = svgOf(els)
  const Client = 'Client' in els ? els.Client : undefined
  const active = last ? flash[last.path] : undefined
  const where = last ? splitPath(relTo(root, spelled(listing, last.path))) : null
  // The newest of a stage (a search, a command, a push…) and the file Claude is on is
  // shown; a helper at work keeps the card while it runs, as its own reads come in too.
  const stageWins = !!stage && (!active || (stage.pose === 'agent' && stage.state === 'running') || stage.at >= (last?.at ?? 0))
  const look = stage && stageWins ? stageLook(stage) : null
  const style = stage && look
    ? { pill: look.word, doing: look.word.toLowerCase(), color: look.color, fill: `${look.color}33`, name: stage.target, dir: stage.dir ?? '' }
    : active && where ? { ...NOW_STYLE[active], name: where.name, dir: where.dir }
    : working ? { pill: 'Thinking', doing: 'thinking', color: IDLE.color, fill: IDLE.fill, name: '', dir: '' } : null
  const pose: Pose = look ? look.pose : active ?? (working ? 'think' : 'idle')
  const icon = style ?? IDLE
  // Without an Svg (the terminal) a translucent fill is painted opaque: the pill is solid there.
  const pillInk = badgeColors(!Svg, icon.color, icon.fill)
  const crab = crabSvg(pose, style ? `Crab ${style.doing}${style.name ? ` ${style.name}` : ''}` : 'Crab asleep: Claude is idle')
  return (
    // minWidth 0 lets the card shrink with the pane; what still does not fit is clipped
    // at its border, never drawn past it (seen live: a long name ran out of the card).
    <Box key="now-card" flexDirection="column" gap="sm" borderStyle="round" borderColor={style ? style.color : IDLE.color} paddingX={1} minWidth={0} overflow="hidden">
    {/* The card's title bar: the folder, its toolbar, the branch and git as chips. */}
    {header}
    {/* One line, kept short so the tree below keeps the room (seen live: three lines and a
        large crab took much of the pane): the crab, what Claude does, the file, its folder. */}
    <Box key="now-row" flexDirection="row" gap={1} alignItems="flex-start" minWidth={0} {...(Svg ? {} : { marginTop: 1 })}>
      {/* The crab, in a pose for what Claude is doing; blocks where the surface has no Svg. */}
      {Svg
        ? <Svg source={crab.source} alt={crab.alt} width={crab.width} height={crab.height} />
        // Four rows of the desktop crab's own grid, a frame or two per pose. A surface with a Client moves it;
        // without one the pose's first frame is drawn still.
        : Client
          ? <Client key={`crab-${pose}`} module="./crab-client.tsx" props={{ pose, color: icon.color } satisfies CrabProps} />
          : (
            <Box key="crab-rows" flexDirection="column" flexShrink={0}>
              {TERM_FRAMES[pose].frames[0]!.map((row, i) => <Text key={`crab-${i}`} color={icon.color}>{row}</Text>)}
            </Box>
          )}
      {/* The line wraps rather than run out of the card; narrow, the pill goes under it, as
          wide as its word (seen live: a column stretched it across the card). */}
      <Box key="now-text" flexDirection="column" alignItems="flex-start" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
        {style
          ? <Text weight="semibold" wrap="wrap">{style.name ? `${style.pill} ` : style.pill}{style.name ? <Text color={style.color}>{style.name}</Text> : null}{style.dir ? <Text dimColor>{` · ${style.dir}`}</Text> : null}</Text>
          : <Text weight="semibold" wrap="wrap">Idle<Text dimColor>{where ? ` · last ${NOW_STYLE[last!.tone].did} ${where.name}` : ' · nothing touched yet'}</Text></Text>}
        {style && narrow ? <Text key="now-pill" color={pillInk.c} backgroundColor={pillInk.bg} weight="semibold">{` ${style.pill} `}</Text> : null}
      </Box>
      {/* The status pill: a Text with a background. */}
      {style && !narrow ? <Text key="now-pill" color={pillInk.c} backgroundColor={pillInk.bg} weight="semibold">{` ${style.pill} `}</Text> : null}
    </Box>
    {/* The session's last test run, kept after the chip is gone; the chip itself is the row's while it shows. */}
    {tests && !(stage && stage.pose === 'test') ? testLine(els, tests, dismissTests) : null}
    {/* The helpers at work, a press opens the Agents tab. */}
    {helpers}
    {/* Below the row: the files Claude touched this session. */}
    {sections}
    </Box>
  )
}
