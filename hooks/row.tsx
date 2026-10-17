// One tree row, drawn by the surface itself. A desktop Button draws a native
// button that drops its children's colours (seen live: a coloured name and
// count inside it came out white), so a row is a Client instead: plain Text
// that keeps its colour, with the press taken from the pointer and posted to
// the hooks module. Drawing rows in a surface module, pressed through
// onPointer and post, and the shimmer that sweeps a lit name, follow the
// filetree mod by Kurt Buhler (MIT); see NOTICE.

import type { ClientModule } from 'claude-code'

/**
 * One run of text: its colour (a theme key or hex), bold, underline, dim, monospace.
 * `sh`, a palette from base to brightest, sweeps a bright band across the run
 * letter by letter while it is drawn; `c` is its colour where a surface draws no band.
 */
export type Seg = { t: string; c?: string; b?: boolean; u?: boolean; dim?: boolean; mono?: boolean; sh?: string[] }
/**
 * `wrap` lets the runs flow onto further lines (a turn's title) instead of fitting
 * one line (a tree row). `hoverAt` is the run underlined under the pointer: 1, the
 * name, unless said.
 */
export type RowProps = { segs: Seg[]; wrap?: boolean; hoverAt?: number }
/** What a row posts when pressed. */
export type RowPost = { press: true }

/** `ref` is mutable on purpose: the running timer is not a value to redraw on. */
type Local = { hover: boolean; phase: number; ref: { stop?: () => void } }

/** How often the band moves one step. */
export const TICK_MS = 90

/** The colour of letter `i` of `len` while the band is at `phase`: brightest under it, base far from it. */
export function shimmer(i: number, phase: number, len: number, palette: readonly string[]): string {
  const band = ((phase * 1.6) % (len + 8)) - 4
  const d = Math.abs(i - band)
  const step = d < 0.8 ? 3 : d < 1.8 ? 2 : d < 2.8 ? 1 : 0
  return palette[Math.min(step, palette.length - 1)] ?? palette[0] ?? ''
}

/** The shortest a clipped name gets before the counts after it give way. */
const MIN_NAME = 8
const width = (s: Seg) => [...s.t].length

/** A name cut to `room` columns, its end replaced by an ellipsis. */
function clipName(s: Seg, room: number): Seg {
  const chars = [...s.t]
  if (chars.length <= room) return s
  return { ...s, t: chars.slice(0, Math.max(1, room - 1)).join('') + '…' }
}

/**
 * Fits a row into `columns` cells, since a row never wraps: the name (the second run)
 * is cut first, down to MIN_NAME, then the trailing counts and git letter give way
 * from the end, then the name is cut further. The indent and the tone word or
 * marker (the third run, when lit) always stay. 0 columns (not laid out yet) fits all.
 */
export function fitRow(segs: readonly Seg[], columns: number): Seg[] {
  const total = (xs: readonly Seg[]) => xs.reduce((n, s) => n + width(s), 0)
  if (columns <= 0 || total(segs) <= columns || segs.length < 2) return [...segs]
  const kept = segs.length > 2 && segs[2]!.sh ? 3 : 2
  let out = [...segs]
  const cut = (floor: number) => {
    const others = total(out) - width(out[1]!)
    out[1] = clipName(out[1]!, Math.max(floor, columns - others))
  }
  cut(Math.min(MIN_NAME, width(segs[1]!)))
  while (total(out) > columns && out.length > kept) out.pop()
  if (total(out) > columns) cut(2)
  return out
}

const Row: ClientModule<RowProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { hover: false, phase: 0, ref: {} }
    surface.setState(state)
  }
  // The clock runs only while a run shimmers, and stops once the row is quiet again.
  const lit = props.segs.some(s => s.sh?.length)
  if (lit && !state.ref.stop) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: cur.phase + 1 })
    })
  } else if (!lit && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }
  const { hover, phase } = state
  surface.onPointer(e => {
    const cur = surface.state ?? state
    if (e.type === 'enter' || (e.type === 'move' && !cur.hover)) { if (!cur.hover) surface.setState({ ...cur, hover: true }); return }
    if (e.type === 'leave') { if (cur.hover) surface.setState({ ...cur, hover: false }); return }
    if (e.type === 'down' && (e.button ?? 'left') === 'left') surface.post({ press: true } satisfies RowPost)
  })
  // Once a click gave it the focus, Enter presses it again, as on a Button.
  surface.onKey(e => { if (e.key === 'return') surface.post({ press: true } satisfies RowPost) })
  const hoverAt = props.hoverAt ?? 1
  const runs = (props.wrap ? props.segs : fitRow(props.segs, surface.columns)).map((s, i) => {
    const style = {
      ...(s.c ? { color: s.c } : {}),
      ...(s.b ? { bold: true } : {}),
      ...(s.u || (hover && i === hoverAt) ? { underline: true } : {}),
      ...(s.dim ? { dimColor: true } : {}),
      ...(s.mono ? { mono: true } : {}),
    }
    if (!s.sh?.length) return <Text {...style}>{s.t}</Text>
    const chars = [...s.t]
    const palette = s.sh
    return <Text {...style}>{chars.map((ch, k) => <Text color={shimmer(k, phase, chars.length, palette)}>{ch}</Text>)}</Text>
  })
  // Wrapping runs sit in one Text, so they flow as one paragraph; a row's sit side by side.
  return props.wrap ? <Text wrap="wrap">{runs}</Text> : <Box flexDirection="row">{runs}</Box>
}

export default Row
