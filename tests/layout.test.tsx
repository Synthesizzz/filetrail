import { expect, test } from 'claude-code/testing'

import type { Step, Turn } from '../types'
import { diffLineText, layoutFor } from '../hooks/history-view'
import { clip, keepIndent, NBSP, splitPath } from '../hooks/paths'
import { KEY, PANE, START, hasText, plain, rowText, world, pressRow } from './world'

const AT = new Date(2026, 9, 17, 17, 5).getTime()
const step = (id: string, rel: string, over: Partial<Step> = {}): Step => ({
  id, path: `C:/work/demo/${rel}`, rel, tool: 'Edit', note: '', status: 'ok', line: 3, add: 1, del: 1,
  diff: [{ op: '-', t: '    return greet(name)' }, { op: '+', t: '    return welcome(name)' }], at: AT, ...over,
})
const T1: Turn = { id: 't1', at: AT - 3_600_000, prompt: 'add greet', steps: [step('a', 'src/lib/a.ts')] }
const T2: Turn = { id: 't2', at: AT, prompt: 'rename greet to welcome everywhere in the project', steps: [step('b', 'src/b.ts'), step('c', 'README.md')] }
const at = (columns: number) => ({ ...PANE, props: { ...PANE.props, bodyColumns: columns } })

test('splitPath, clip and layoutFor', () => {
  expect(splitPath('trail-demo/deep/notes.md')).toEqual({ name: 'notes.md', dir: 'trail-demo/deep' })
  expect(splitPath('README.md')).toEqual({ name: 'README.md', dir: '' })
  expect(clip('abcdef', 4)).toBe('abc…')
  expect(clip('abc', 4)).toBe('abc')
  expect(layoutFor(40)).toEqual({ width: 40, narrow: true, wide: false })
  expect(layoutFor(60)).toEqual({ width: 60, narrow: false, wide: false })
  expect(layoutFor(120)).toEqual({ width: 120, narrow: false, wide: true })
})

test('diff lines keep indentation and runs of spaces, but single spaces stay plain so they can wrap', () => {
  expect(keepIndent('    if (a  && b) x')).toBe(`${NBSP.repeat(4)}if (a${NBSP.repeat(2)}&& b) x`)
  const line = diffLineText({ op: '+', t: '  const x = 1' }, '7', 3)
  expect(line).toBe(`${NBSP.repeat(2)}7${NBSP}+${NBSP}${NBSP.repeat(2)}const x = 1`)
  expect(line.includes(' ')).toBe(true)
})

test('narrow: the file name leads, its folder dimmed after it', async ($, on) => {
  world(on, { stored: { [KEY]: [T1, T2] }, now: AT })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...at(40) })
  await ui.press({ key: 'tab-history' })
  await pressRow(ui, 'turn-t1')
  expect(await rowText(ui, 'file-filter')).toBe('a.ts src/lib')
  expect(await hasText(ui, '3 - return greet(name)'.replace('- ', '-     '))).toBe(true)
  expect(await ui.find({ key: 'back' })).toBeDefined()
  await ui.unmount()
})

test('normal width keeps the whole path and one page at a time', async ($, on) => {
  world(on, { stored: { [KEY]: [T1, T2] }, now: AT })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...at(60) })
  await ui.press({ key: 'tab-history' })
  // One page at a time: the timeline alone, no step on show until a turn is opened.
  expect(await hasText(ui, 'step 1 of 2')).toBe(false)
  await pressRow(ui, 'turn-t1')
  expect(await rowText(ui, 'file-filter')).toBe('src/lib/a.ts')
  expect(await ui.find({ key: 'turn-t2' })).toBeUndefined()
  await ui.unmount()
})

test('wide: the turn list and the latest turn side by side; picking a turn on the left changes the right', async ($, on) => {
  world(on, { stored: { [KEY]: [T1, T2] }, now: AT })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...at(120) })
  await ui.press({ key: 'tab-history' })

  expect(await ui.find({ key: 'turn-t1' })).toBeDefined()
  expect(await ui.find({ key: 'turn-t2' })).toBeDefined()
  expect(await hasText(ui, 'step 1 of 2')).toBe(true)
  expect(await rowText(ui, 'turn-t2')).toMatch(/^› /)
  expect(await ui.find({ key: 'back' })).toBeUndefined()

  await pressRow(ui, 'turn-t1')
  expect(await hasText(ui, 'step 1 of 1')).toBe(true)
  expect(await rowText(ui, 'turn-t1')).toMatch(/^› /)
  expect(await ui.find({ key: 'turn-t2' })).toBeDefined()

  // Stepping on the right keeps the list.
  await pressRow(ui, 'turn-t2')
  await ui.press({ key: 'next' })
  expect(await hasText(ui, 'step 2 of 2')).toBe(true)
  expect(plain((await ui.find({ key: 'file-filter' }))?.text)).toBe('README.md')
  await ui.unmount()
})

test('wide with no history says so in the list', async ($, on) => {
  world(on, { now: AT })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...at(120) })
  await ui.press({ key: 'tab-history' })
  expect(await hasText(ui, 'No edits recorded yet.')).toBe(true)
  await ui.unmount()
})
