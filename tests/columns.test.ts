import { expect, test } from 'claude-code/testing'

import { rightSlots } from '../hooks/columns'
import type { Cell } from '../hooks/columns'
import type { Seg } from '../hooks/row'
import { NBSP, NNBSP, cells } from '../hooks/paths'

const text = (segs: readonly Seg[]) => segs.map(s => s.t).join('')

// A folder with Claude's edits, lines and counts by kind; a changed file; a file only git knows as untracked.
const FOLDER: Cell = { a: { t: '●21', c: 'claude' }, p: { t: '+340', c: '#add' }, m: { t: '-88', c: '#del' }, g: [{ t: '?:1', c: '#new' }, { t: 'M:5', c: '#chg' }] }
const FILE: Cell = { a: { t: '●4', c: 'claude' }, p: { t: '+20' }, m: { t: '-3' }, g: [{ t: 'M', c: '#chg' }] }
const NEW: Cell = { g: [{ t: 'U', c: '#new' }] }

test('rightSlots gives every slot the width of its longest value and sets the values flush right', () => {
  const [folder, file] = rightSlots([FOLDER, FILE])
  expect(text(folder!)).toBe(`${NNBSP}●21${NNBSP}+340${NNBSP}-88${NNBSP}?:1${NNBSP}M:5`)
  expect(text(file!)).toBe(`${NNBSP}${NBSP}●4${NNBSP}${NBSP}+20${NNBSP}${NBSP}-3${NNBSP}${NBSP.repeat(6)}M`)
  // Same width, so the columns line up row to row.
  expect(cells(text(file!))).toBe(cells(text(folder!)))
})

test('rightSlots keeps a slot a row leaves empty as blank room, so its other values stay in their columns', () => {
  const [, , untracked] = rightSlots([FOLDER, FILE, NEW])
  expect(cells(text(untracked!))).toBe(cells(text(rightSlots([FOLDER])[0]!)))
  expect(text(untracked!).endsWith(`${NNBSP}${NBSP.repeat(6)}U`)).toBe(true)
  // The blank room before it is all padding, which a narrow row can give up.
  const blanks = untracked!.filter(s => s.pad)
  expect(blanks.length).toBeGreaterThan(0)
  // Without the padding what is left is the one value and the narrow space before it.
  expect(text(untracked!.filter(s => !s.pad))).toBe(`${NNBSP}U`)
})

test('rightSlots draws nothing for a row with nothing to show, and counts it nowhere', () => {
  const out = rightSlots([{}, FILE])
  expect(out[0]).toEqual([])
  // Only FILE's own values set the widths: no padding for a slot only the empty row would have wanted.
  expect(text(out[1]!)).toBe(`${NNBSP}●4${NNBSP}+20${NNBSP}-3${NNBSP}M`)
})

test('rightSlots gives a slot no row uses no width', () => {
  const [row] = rightSlots([NEW])
  expect(text(row!)).toBe(`${NNBSP}U`)
})

test('every run it makes sits at the row\'s right edge, padding is marked pad, values keep their colour', () => {
  const [folder, file] = rightSlots([FOLDER, FILE])
  for (const s of [...folder!, ...file!]) expect(s.right).toBe(true)
  for (const s of file!.filter(x => x.pad)) expect(s.t.replace(new RegExp(`[${NBSP}${NNBSP}]`, 'g'), '')).toBe('')
  expect(file!.find(s => s.t === '●4')?.c).toBe('claude')
  expect(file!.find(s => s.t === 'M')?.c).toBe('#chg')
  expect(file!.find(s => s.t === '●4')?.pad).toBeUndefined()
})

test('a dimmed value (a closed folder with Claude\'s edits inside) keeps its dim and takes the edits slot', () => {
  const quiet: Cell = { a: { t: '●', c: 'claude', dim: true } }
  const [file, folder] = rightSlots([FILE, quiet])
  expect(folder!.find(s => s.t === '●')?.dim).toBe(true)
  expect(cells(text(folder!))).toBe(cells(text(file!)))
})
