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
 * `right` runs sit at the row's right edge (counts, a git letter), after a spacer.
 * `name` marks the run cut first when the row is too long (the second run if none is);
 * `opt` runs (a file's time) give way before anything else.
 */
export type Seg = { t: string; c?: string; b?: boolean; u?: boolean; dim?: boolean; mono?: boolean; sh?: string[]; right?: boolean; name?: boolean; opt?: boolean }
/**
 * `wrap` lets the runs flow onto further lines (a turn's title) instead of fitting
 * one line (a tree row). `hoverAt` is the run underlined under the pointer: the
 * name, unless said. `bg` fills the row (the selected one). `mono` sets every run in
 * the monospace face, so columns line up from row to row.
 */
export type RowProps = { segs: Seg[]; wrap?: boolean; hoverAt?: number; bg?: string; mono?: boolean }
/** What a row posts: a click, the second click of a double-click, or a right-click (shift for the whole path). */
export type RowPost = { press: true } | { open: true } | { copy: true; full: boolean }

/** Two clicks this close (ms) on one row are a double-click, as filetree times them. */
export const DOUBLE_MS = 450

/** `ref` is mutable on purpose: the running timer is not a value to redraw on. */
type Local = { hover: boolean; phase: number; ref: { stop?: () => void; lastDown?: number } }

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

/** Where a row's name is: the run marked `name`, else the second. */
export const nameAt = (segs: readonly Seg[]) => Math.max(1, segs.findIndex(s => s.name))

/**
 * Fits a row into `columns` cells, since a row never wraps: `opt` runs go first, then
 * the name is cut, down to MIN_NAME, then the trailing counts and git letter give way
 * from the end, then the name is cut further. What comes before the name and the tone
 * word right after it (when lit) always stay. 0 columns (not laid out yet) fits all.
 */
export function fitRow(segs: readonly Seg[], columns: number): Seg[] {
  const total = (xs: readonly Seg[]) => xs.reduce((n, s) => n + width(s), 0)
  if (columns <= 0 || total(segs) <= columns || segs.length < 2) return [...segs]
  const out = segs.filter(s => !s.opt)
  if (total(out) <= columns) return out
  const at = nameAt(out)
  const kept = out.length > at + 1 && out[at + 1]!.sh ? at + 2 : at + 1
  const cut = (floor: number) => {
    const others = total(out) - width(out[at]!)
    out[at] = clipName(out[at]!, Math.max(floor, columns - others))
  }
  cut(Math.min(MIN_NAME, width(out[at]!)))
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
    if (e.type !== 'down') return
    if (e.button === 'right') { surface.post({ copy: true, full: e.shift === true } satisfies RowPost); return }
    if ((e.button ?? 'left') !== 'left') return
    // A second click soon after the first opens; the first has already pressed (selected).
    const at = Date.now()
    const ref = (surface.state ?? state).ref
    if (ref.lastDown !== undefined && at - ref.lastDown < DOUBLE_MS) {
      ref.lastDown = undefined
      surface.post({ open: true } satisfies RowPost)
      return
    }
    ref.lastDown = at
    surface.post({ press: true } satisfies RowPost)
  })
  // Once a click gave it the focus, Enter presses it again, as on a Button.
  surface.onKey(e => { if (e.key === 'return') surface.post({ press: true } satisfies RowPost) })
  const hoverAt = props.hoverAt ?? nameAt(props.segs)
  const fitted = props.wrap ? props.segs : fitRow(props.segs, surface.columns)
  const runs = fitted.map((s, i) => {
    const style = {
      ...(s.c ? { color: s.c } : {}),
      ...(s.b ? { bold: true } : {}),
      ...(s.u || (hover && i === hoverAt) ? { underline: true } : {}),
      ...(s.dim ? { dimColor: true } : {}),
      ...(s.mono || props.mono ? { mono: true } : {}),
      // A row never wraps: a run too long for its room is cut (seen live: a monospace name and
      // its counts each broke onto a second line).
      ...(props.wrap ? {} : { wrap: 'truncate-end' as const }),
    }
    if (!s.sh?.length) return <Text {...style}>{s.t}</Text>
    const chars = [...s.t]
    const palette = s.sh
    return <Text {...style}>{chars.map((ch, k) => <Text color={shimmer(k, phase, chars.length, palette)}>{ch}</Text>)}</Text>
  })
  // Wrapping runs sit in one Text, so they flow as one paragraph; a row's sit side by side,
  // the right-hand ones pushed to the edge by a spacer.
  if (props.wrap) return <Text wrap="wrap">{runs}</Text>
  const left = runs.filter((_, i) => !fitted[i]!.right)
  const right = runs.filter((_, i) => fitted[i]!.right)
  return (
    <Box flexDirection="row" {...(props.bg ? { backgroundColor: props.bg } : {})}>
      {/* As filetree lays a row out: the left side gives way (clipped), the badges keep their width. */}
      <Box flexDirection="row" flexShrink={1} overflow="hidden">{left}</Box>
      {right.length ? <Box flexGrow={1} /> : null}
      {right.length ? <Box flexDirection="row" flexShrink={0}>{right}</Box> : null}
    </Box>
  )
}

export default Row
