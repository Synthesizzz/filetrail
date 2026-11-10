// The tree's right edge as four columns, so a number sits under the same kind of number
// in every row: Claude's edits (●N), lines added, lines removed, then git's word (a file's
// letter, or a folder's counts by kind). No engine calls here.

import type { Seg } from './row'
import { NBSP, NNBSP, cells } from './paths'

/**
 * One row's values, each already coloured and with no space before it: `a` Claude's edits,
 * `p` lines added, `m` lines removed, `g` git's word (several runs for a folder's counts).
 */
export type Cell = { a?: Seg; p?: Seg; m?: Seg; g?: Seg[] }

const SLOTS = ['a', 'p', 'm', 'g'] as const
type Slot = (typeof SLOTS)[number]

const runsOf = (cell: Cell, slot: Slot): Seg[] => (slot === 'g' ? cell.g ?? [] : cell[slot] ? [cell[slot]!] : [])
/** Columns a slot's runs take, a narrow space between them. */
const widthOf = (runs: readonly Seg[]) => runs.reduce((n, s) => n + cells(s.t), 0) + Math.max(0, runs.length - 1)

/**
 * The runs at each row's right edge, one list per row (in `rows`' order). A slot is as wide
 * as its longest value among `rows`, and a value sits flush right in it, so the columns line
 * up; a slot no row uses takes no room. The blank room is `pad`, which a narrow row gives up
 * (its values then sit close) before its name is cut. A row with no value gets [], so it
 * keeps its width for its name.
 */
export function rightSlots(rows: readonly Cell[]): Seg[][] {
  const width: Record<Slot, number> = { a: 0, p: 0, m: 0, g: 0 }
  for (const row of rows) for (const slot of SLOTS) width[slot] = Math.max(width[slot], widthOf(runsOf(row, slot)))
  return rows.map(row => {
    if (!SLOTS.some(slot => runsOf(row, slot).length)) return []
    const out: Seg[] = []
    for (const slot of SLOTS) {
      if (!width[slot]) continue
      const runs = runsOf(row, slot)
      // Nothing here in this row: the slot's room and the space before it, all blank.
      if (!runs.length) { out.push({ t: NBSP.repeat(1 + width[slot]), right: true, pad: true }); continue }
      out.push({ t: NNBSP, right: true })
      const room = width[slot] - widthOf(runs)
      if (room > 0) out.push({ t: NBSP.repeat(room), right: true, pad: true })
      runs.forEach((run, i) => {
        if (i) out.push({ t: NNBSP, right: true })
        out.push({ ...run, right: true })
      })
    }
    return out
  })
}
