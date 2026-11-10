import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { DOT_GLYPHS, dayTotals, dotOf, railBars } from '../hooks/history-view'
import { GAP_MIN, cellWidth, cells, clipCells, gapMinutes, gapText, wrapLines } from '../hooks/paths'

const NOW = new Date(2026, 9, 17, 17, 5).getTime()
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime()

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id, path: `C:/work/demo/${id}.ts`, rel: `${id}.ts`, tool: 'Edit', note: '', status: 'ok', line: 1, add: 1, del: 0, diff: [], at: NOW, ...over,
})
const turn = (id: string, steps: Step[], over: Partial<Turn> = {}): Turn => ({ id, at: NOW, prompt: id, steps, ...over })
const many = (n: number, over: Partial<Step> = {}) => Array.from({ length: n }, (_, i) => step(`s${i}`, over))
const blocked = (tool = 'Bash') => ({ id: `b-${tool}`, tool, call: 'x', kind: 'hook' as const, reason: '' })

test('cellWidth: a Thai vowel or tone mark above or below a letter takes no column, a wide character two', () => {
  expect(cellWidth('a')).toBe(1)
  expect(cellWidth('ท')).toBe(1)
  expect(cellWidth('ี')).toBe(0)
  expect(cellWidth('่')).toBe(0)
  expect(cellWidth('日')).toBe(2)
  expect(cellWidth('\u00a0')).toBe(1)
  expect(cells('abc')).toBe(3)
  expect(cells('ที่')).toBe(1)
  expect(cells('ทดสอบที่นี่')).toBe(7)
  expect(cells('日本')).toBe(4)
})

test('clipCells cuts to a number of columns, leaving a letter its marks, and an ellipsis', () => {
  expect(clipCells('abcdef', 4)).toBe('abc…')
  expect(clipCells('abc', 4)).toBe('abc')
  expect(clipCells('ทดสอบที่นี่ทดสอบ', 7)).toBe('ทดสอบที่…')
  expect(cells(clipCells('ทดสอบที่นี่ทดสอบ', 7))).toBeLessThanOrEqual(7)
  expect(clipCells('日本語日本語', 5)).toBe('日本…')
})

test('wrapLines counts the lines a text takes in a column: breaks at plain spaces, long words cut, marks free', () => {
  expect(wrapLines('', 10)).toBe(1)
  expect(wrapLines('aaa bbb ccc', 7)).toBe(2)
  expect(wrapLines('aaa bbb ccc', 6)).toBe(3)
  expect(wrapLines('aaa bbb ccc', 11)).toBe(1)
  // A word longer than the column starts a line of its own and is cut across lines.
  expect(wrapLines('x'.repeat(25), 10)).toBe(3)
  expect(wrapLines('hi ' + 'x'.repeat(25), 10)).toBe(4)
  // A non-breaking space glues what it joins: the time and the first word of a title.
  expect(wrapLines('17:00\u00a0\u00a0abcdefgh', 10)).toBe(2)
  expect(wrapLines('17:00\u00a0\u00a0abc', 10)).toBe(1)
  // Thai has no spaces to break at: it fills the line.
  expect(wrapLines('ก'.repeat(40), 10)).toBe(4)
  expect(wrapLines('ทดสอบที่นี่', 7)).toBe(1)
  expect(wrapLines('ทดสอบที่นี่', 6)).toBe(2)
  // A column of nothing or less still counts, a cell at a time.
  expect(wrapLines('abc', 0)).toBe(3)
})

test('gapText: a gap shows from GAP_MIN minutes, in minutes, hours or days', () => {
  expect(GAP_MIN).toBe(8)
  expect(gapText(0)).toBe('')
  expect(gapText(GAP_MIN - 1)).toBe('')
  expect(gapText(GAP_MIN)).toBe('8 min earlier')
  expect(gapText(59)).toBe('59 min earlier')
  expect(gapText(60)).toBe('1 h earlier')
  expect(gapText(83)).toBe('1 h 23 min earlier')
  expect(gapText(1440)).toBe('1 d earlier')
  expect(gapText(1500)).toBe('1 d 1 h earlier')
})

test('gapMinutes: whole minutes between two times, never below 0, whatever the day', () => {
  expect(gapMinutes(at(17, 17, 20), at(17, 17, 0))).toBe(20)
  expect(gapMinutes(at(17, 17, 0) + 59_000, at(17, 17, 0))).toBe(0)
  expect(gapMinutes(at(17, 17, 0) + 90_000, at(17, 17, 0))).toBe(1)
  // Across midnight it is the time between, not the clock's difference.
  expect(gapMinutes(at(17, 0, 10), at(16, 23, 50))).toBe(20)
  expect(gapMinutes(at(17, 9), at(17, 10))).toBe(0)
})

test('dotOf: size by edits, colour by how the turn ended', () => {
  expect(DOT_GLYPHS).toHaveLength(4)
  const level = (n: number) => dotOf(turn('t', many(n)), false)
  expect([0, 1, 2, 3, 9, 10, 40].map(n => level(n).level)).toEqual([0, 1, 1, 2, 2, 3, 3])
  expect([0, 1, 3, 10].map(n => level(n).glyph)).toEqual([DOT_GLYPHS[0], DOT_GLYPHS[1], DOT_GLYPHS[2], DOT_GLYPHS[3]])
  expect(new Set(DOT_GLYPHS).size).toBe(4)
  // Green when every edit went through; a turn with nothing on a file is grey.
  expect(dotOf(turn('t', many(2)), false).color).toBe('success')
  expect(dotOf(turn('t', []), false).color).toBe('#6b7280')
  // An edit not applied is red, over a blocked call, which is orange.
  expect(dotOf(turn('t', [step('a'), step('b', { status: 'denied' })]), false).color).toBe('error')
  expect(dotOf(turn('t', [step('a', { status: 'failed' })]), false).color).toBe('error')
  expect(dotOf(turn('t', [step('a')], { blocked: [blocked()] }), false).color).toBe('warning')
  expect(dotOf(turn('t', [step('a', { status: 'denied' })], { blocked: [blocked()] }), false).color).toBe('error')
  // No edit but a blocked call: the small dot, orange.
  expect(dotOf(turn('t', [], { blocked: [blocked()] }), false)).toMatchObject({ level: 0, color: 'warning' })
  // A refused Edit is already an edit not applied: it does not turn a green turn orange too.
  expect(dotOf(turn('t', [step('a')], { blocked: [blocked('Edit')] }), false).color).toBe('success')
  // Running: Claude's colour, whatever the steps so far.
  expect(dotOf(turn('t', [step('a', { status: 'pending' })]), true).color).toBe('claude')
})

test('dayTotals: turns, lines added and removed for each day shown, in the order the days come', () => {
  const turns = [
    turn('a', [step('a', { add: 5, del: 1 })], { at: at(16, 9) }),
    turn('b', [step('b', { add: 2, del: 2 }), step('c', { add: 1, del: 0 })], { at: at(16, 10) }),
    turn('c', [], { at: at(17, 9), blocked: [blocked()] }),
    turn('d', [step('d', { add: 100, del: 50 })], { at: at(17, 11) }),
  ]
  expect(dayTotals(turns, NOW)).toEqual([
    { label: 'Yesterday', turns: 2, add: 8, del: 3 },
    { label: 'Today', turns: 2, add: 100, del: 50 },
  ])
  expect(dayTotals([...turns].reverse(), NOW).map(d => d.label)).toEqual(['Today', 'Yesterday'])
  expect(dayTotals([], NOW)).toEqual([])
})

test('railBars: one bar for each line the row has below its dot, one more while another row follows', () => {
  expect(railBars(1, false)).toBe('')
  expect(railBars(1, true)).toBe('│')
  expect(railBars(3, false)).toBe('│\n│')
  expect(railBars(3, true)).toBe('│\n│\n│')
})
