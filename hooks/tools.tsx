// The tree's toolbar, drawn by the surface itself so hovering an icon can say what it
// does: a desktop Button has no tooltip, and an Svg's <title> tooltip cannot be
// pressed. The icon under the pointer lights and its hint shows to its left; a click
// posts the tool's id to the hooks module, and the toolbar answers it at once, on its own:
// the icon flashes in Claude's colour (refresh spins) and what was done shows where the
// hint was, in green, for a moment (seen live: a click with no answer read as nothing done).

import type { ClientModule } from 'claude-code'

/** One icon: its id (what a click posts), the glyph, the hint shown while hovered, and what a click did. */
export type Tool = { id: string; glyph: string; hint: string; done?: string }
export type ToolsProps = { tools: Tool[] }
/** What a click posts. */
export type ToolPost = { tool: string }

/** Cells each icon takes: a narrow space either side of the glyph, in the monospace face. */
export const CELL = 3

/** A click's answer: the icon pressed, its word, and the frames it has left. */
type Flash = { at: number; word: string; left: number }
type Local = { hover: number; flash?: Flash }

/** The answer's frame: how often it steps, and how many steps it lasts (about 1.2 s). */
export const FLASH_TICK_MS = 60
export const FLASH_FRAMES = 20
/** The refresh icon spins through these for the answer's first frames. */
export const SPIN = ['◐', '◓', '◑', '◒'] as const
const SPIN_FRAMES = 8
const ACCENT = '#d97757'
const DONE = '#22c55e'

/** The glyph an icon shows while it answers a click: a spinning one for refresh, its own otherwise. */
export function flashGlyph(tool: Tool, flash: Flash): string {
  const spent = FLASH_FRAMES - flash.left
  return tool.id === 'refresh' && spent < SPIN_FRAMES ? SPIN[spent % SPIN.length]! : tool.glyph
}

/** Which icon a column falls on, or -1: the icons sit at the region's right edge. */
export function toolAt(x: number, columns: number, count: number): number {
  const start = columns - count * CELL
  if (x < start || x >= columns) return -1
  return Math.min(count - 1, Math.floor((x - start) / CELL))
}

const Tools: ClientModule<ToolsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  // One clock for the toolbar's life, started with it: it redraws only while a click is answered.
  if (surface.state === undefined) {
    surface.setState({ hover: -1 })
    surface.every(FLASH_TICK_MS, () => {
      const cur = surface.state
      if (!cur?.flash) return
      surface.setState(cur.flash.left > 1 ? { ...cur, flash: { ...cur.flash, left: cur.flash.left - 1 } } : { hover: cur.hover })
    })
  }
  const hover = surface.state?.hover ?? -1
  const flash = surface.state?.flash
  const count = props.tools.length
  surface.onPointer(e => {
    const cur = surface.state ?? { hover: -1 }
    const at = e.type === 'leave' ? -1 : toolAt(e.x, surface.columns, count)
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && at >= 0) {
      const tool = props.tools[at]!
      surface.setState({ hover: at, flash: { at, word: tool.done ?? tool.hint, left: FLASH_FRAMES } })
      surface.post({ tool: tool.id } satisfies ToolPost)
      return
    }
    if (at !== cur.hover) surface.setState({ ...cur, hover: at })
  })
  const hint = hover >= 0 ? props.tools[hover]?.hint : undefined
  // Non-breaking spaces around each glyph: a surface may collapse plain ones (the desktop does).
  return (
    <Box flexDirection="row">
      <Box flexGrow={1} />
      {/* What a click did, in green, for a moment; else the hovered icon's hint. */}
      {flash
        ? <Box flexShrink={1} overflow="hidden"><Text color={DONE} weight="semibold" wrap="truncate-end">{`✓ ${flash.word}`}</Text></Box>
        : hint ? <Box flexShrink={1} overflow="hidden"><Text dimColor wrap="truncate-end">{hint}</Text></Box> : null}
      {props.tools.map((t, i) => (
        flash && i === flash.at
          ? <Text mono color={ACCENT} weight="semibold">{` ${flashGlyph(t, flash)} `}</Text>
          : <Text mono {...(i === hover ? { weight: 'semibold' as const } : { dimColor: true })}>{` ${t.glyph} `}</Text>
      ))}
    </Box>
  )
}

export default Tools
