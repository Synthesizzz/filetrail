// The tree's toolbar, drawn by the surface itself so hovering an icon can say what it
// does: a desktop Button has no tooltip, and an Svg's <title> tooltip cannot be
// pressed. The icon under the pointer lights and its hint shows to its left; a click
// posts the tool's id to the hooks module.

import type { ClientModule } from 'claude-code'

/** One icon: its id (what a click posts), the glyph, and the hint shown while hovered. */
export type Tool = { id: string; glyph: string; hint: string }
export type ToolsProps = { tools: Tool[] }
/** What a click posts. */
export type ToolPost = { tool: string }

/** Cells each icon takes: a narrow space either side of the glyph, in the monospace face. */
export const CELL = 3

type Local = { hover: number }

/** Which icon a column falls on, or -1: the icons sit at the region's right edge. */
export function toolAt(x: number, columns: number, count: number): number {
  const start = columns - count * CELL
  if (x < start || x >= columns) return -1
  return Math.min(count - 1, Math.floor((x - start) / CELL))
}

const Tools: ClientModule<ToolsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? -1
  const count = props.tools.length
  surface.onPointer(e => {
    const at = e.type === 'leave' ? -1 : toolAt(e.x, surface.columns, count)
    if (at !== (surface.state?.hover ?? -1)) surface.setState({ hover: at })
    if (e.type === 'down' && (e.button ?? 'left') === 'left' && at >= 0) surface.post({ tool: props.tools[at]!.id } satisfies ToolPost)
  })
  const hint = hover >= 0 ? props.tools[hover]?.hint : undefined
  // Non-breaking spaces around each glyph: a surface may collapse plain ones (the desktop does).
  return (
    <Box flexDirection="row">
      <Box flexGrow={1} />
      {hint ? <Box flexShrink={1} overflow="hidden"><Text dimColor wrap="truncate-end">{hint}</Text></Box> : null}
      {props.tools.map((t, i) => (
        <Text mono {...(i === hover ? { bold: true } : { dimColor: true })}>{` ${t.glyph} `}</Text>
      ))}
    </Box>
  )
}

export default Tools
