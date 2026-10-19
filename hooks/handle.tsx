// The card's drag handle: a thin bar along its bottom border. Dragged down, the TOUCHED
// list will show more files; dragged up, fewer, down to none. While held, the bar itself
// previews the size it comes to ("▼ 5 files · + c.md, b.md"), and the list changes once,
// when the button comes up. Drawn by the surface so it can follow the pointer: after a
// press it gets every move until the button comes up, past its own edges too. It keeps
// to one line: a Client that changes its own height as it draws is refused on the desktop
// (seen live).

import type { ClientModule } from 'claude-code'

/** `rows`: the files the list shows now; `max`: as many as it can; `names`: the touched files' names, newest first. */
export type HandleProps = { rows: number; max: number; names: string[] }
/** What a drag posts once the button is up: the count wanted. */
export type HandlePost = { resize: number; end: true }

type Local = { hover?: boolean; y0?: number; from?: number; at?: number }

/** The count a drag from `from` comes to, `dy` rows down (up when negative), kept within 0 and `max`. */
export function dragRows(from: number, dy: number, max: number): number {
  return Math.max(0, Math.min(max, from + Math.round(dy)))
}

/** The bar's words while held: the size it comes to, and which files that adds, or how many it takes away. */
export function previewText(rows: number, at: number, names: readonly string[]): string {
  const count = `${at} file${at === 1 ? '' : 's'}`
  if (at > rows) return `▼ ${count} · + ${names.slice(rows, at).join(', ')}`
  if (at < rows) return `▲ ${count} · − ${rows - at}`
  return `${count}`
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
    // Held: only the bar's preview changes. Let go: the list takes the size, once.
    if (e.type === 'move' && rows !== cur.at) surface.setState({ ...cur, at: rows })
    if (e.type === 'up') {
      surface.setState({ hover: cur.hover })
      if (rows !== props.rows) surface.post({ resize: rows, end: true } satisfies HandlePost)
    }
  })
  const held = s.y0 !== undefined && s.at !== undefined
  const active = s.hover === true || held
  const middle = held ? ` ${previewText(props.rows, s.at!, props.names)} ` : ' ⋯ '
  // A rule across the card with the grip, or the preview, in the middle; cut to the bar's width.
  const width = surface.columns
  const words = [...middle].length > width - 4 ? [...middle].slice(0, Math.max(1, width - 5)).join('') + '… ' : middle
  const side = Math.max(1, Math.floor((width - [...words].length) / 2))
  const rest = Math.max(0, width - side - [...words].length)
  return (
    <Box flexDirection="row">
      <Text mono wrap="truncate-end" {...(active ? {} : { dimColor: true })}>{'─'.repeat(side)}{held ? <Text weight="semibold">{words}</Text> : words}{'─'.repeat(rest)}</Text>
    </Box>
  )
}

export default Handle
