// The card's drag handle: a thin bar along its bottom border. Dragged down, the TOUCHED
// list shows more files; dragged up, fewer, down to none. Drawn by the surface so it can
// follow the pointer: after a press it gets every move until the button comes up, past
// its own edges too. It posts the count as it changes, and once more when let go.

import type { ClientModule } from 'claude-code'

/** `rows`: the files the list shows now; `max`: as many as it can. */
export type HandleProps = { rows: number; max: number }
/** What a drag posts: the count wanted, and `end` once the button is up (the count is kept then). */
export type HandlePost = { resize: number; end?: true }

type Local = { hover?: boolean; y0?: number; from?: number; at?: number }

/** The count a drag from `from` comes to, `dy` rows down (up when negative), kept within 0 and `max`. */
export function dragRows(from: number, dy: number, max: number): number {
  return Math.max(0, Math.min(max, from + Math.round(dy)))
}

const Handle: ClientModule<HandleProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const s = surface.state ?? {}
  surface.onPointer(e => {
    const cur = surface.state ?? {}
    if (e.type === 'enter' || e.type === 'leave') {
      if (cur.y0 === undefined) surface.setState({ ...cur, hover: e.type === 'enter' })
      return
    }
    if (e.type === 'down' && (e.button ?? 'left') === 'left') {
      surface.setState({ ...cur, y0: e.fine?.y ?? e.y, from: props.rows, at: props.rows })
      return
    }
    if (cur.y0 === undefined || cur.from === undefined) return
    const rows = dragRows(cur.from, (e.fine?.y ?? e.y) - cur.y0, props.max)
    if (e.type === 'move' && rows !== cur.at) {
      surface.setState({ ...cur, at: rows })
      surface.post({ resize: rows } satisfies HandlePost)
    }
    if (e.type === 'up') {
      surface.setState({ hover: cur.hover })
      surface.post({ resize: rows, end: true } satisfies HandlePost)
    }
  })
  const active = s.hover === true || s.y0 !== undefined
  // A rule across the card with a grip in the middle; brighter while hovered or dragged.
  const side = Math.max(0, Math.floor((surface.columns - 3) / 2))
  return (
    <Box flexDirection="row">
      <Text mono {...(active ? {} : { dimColor: true })}>{`${'─'.repeat(side)} ⋯ ${'─'.repeat(Math.max(0, surface.columns - side - 3))}`}</Text>
    </Box>
  )
}

export default Handle
