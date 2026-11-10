import { expect, test } from 'claude-code/testing'

import { FLASH_MS } from '../hooks/activity'
import { crabSvg, CRAB_PX, CRAB_ROWS, GONE, MERGE, PUSH, TERM_FRAMES } from '../hooks/crab'
import { badgeOf, BRANCH_GLYPH, CHIP_BG, GIT_HEX, ICON_MUTED, typeColor } from '../hooks/files-view'

const BOOK_COLOR = '#8b5cf6'
import { NOW_STYLE, STAGE_STYLE, spelled } from '../hooks/now-card'
import { DONE, PANE, START, hasText, pressRow, rowRuns, rowText, world } from './world'

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['Src', 'dir']],
  'C:/work/demo/Src': [['App.ts', 'file']],
}

test('spelled finds the tree\'s spelling of a lower-cased path', () => {
  const listing = { 'c:/work/demo/src': [{ name: 'App.ts', path: 'C:/work/demo/Src/App.ts', kind: 'file' as const }] }
  expect(spelled(listing, 'c:/work/demo/src/app.ts')).toBe('C:/work/demo/Src/App.ts')
  expect(spelled(listing, 'c:/elsewhere/x.ts')).toBe('c:/elsewhere/x.ts')
})

test('the card says idle before anything is touched, what Claude is doing while lit, then idle with the last file', { timeoutMs: 10_000 }, async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await hasText(ui, 'Idle · nothing touched yet')).toBe(true)

  // One line beside the crab: what Claude does, the file, its folder dimmed.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\Src\\App.ts' })
  await clock.advance(200)
  expect(await hasText(ui, 'Reading App.ts · Src')).toBe(true)
  expect(await hasText(ui, 'RIGHT NOW')).toBe(false)
  const pill = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text === '\u00a0Reading\u00a0')
  expect(pill?.props).toMatchObject({ color: NOW_STYLE.read.color, backgroundColor: NOW_STYLE.read.fill })
  expect(await ui.find({ key: 'now-card' })).toMatchObject({ props: { borderStyle: 'round' } })

  // Still on it past a search's fade; idle once the turn ends.
  await clock.advance(FLASH_MS + 100)
  expect(await hasText(ui, 'Reading App.ts · Src')).toBe(true)
  await $.turn.complete({ ...DONE, turnId: 't0' })
  await clock.settle()
  expect(await hasText(ui, 'Idle · last read App.ts')).toBe(true)
  await ui.unmount()
})

test('the card shrinks with the pane: the line wraps, and narrow the pill goes under it', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  // The kit addresses no Text by key: the pill is found by its words, NBSP-padded.
  const PILL = '\u00a0Reading\u00a0'
  for (const [columns, under] of [[60, false], [40, true]] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE, props: { ...PANE.props, bodyColumns: columns } })
    await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\Src\\App.ts' })
    await clock.advance(200)
    expect(await ui.find({ key: 'now-card' })).toMatchObject({ props: { minWidth: 0, overflow: 'hidden' } })
    expect(JSON.stringify(await ui.find({ key: 'now-text' })).includes(PILL)).toBe(under)
    expect((await ui.findAll({ type: 'Text' })).some((t: any) => t.text === PILL)).toBe(true)
    await ui.unmount()
  }
})

test('badgeOf: the whole extension upper-cased', () => {
  expect(badgeOf('C:/w/client.test.js')).toBe('JS')
  expect(badgeOf('C:/w/README.markdown')).toBe('MARKDOWN')
  expect(badgeOf('C:/w/Practice_Solution.ipynb')).toBe('IPYNB')
  expect(badgeOf('C:/w/Makefile')).toBe('TXT')
})

test('the branch and git are chips in the card; the file picked for Claude is one slim line under search', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, git: { top: 'C:/work/demo', status: '## main\0', numstat: '' } })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // The branch and the repo's state are chips in the card's title bar.
  expect(await ui.find({ key: 'branch-chips' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'clean' })).toBeDefined()
  await pressRow(ui, 'row-c:/work/demo/src')
  await pressRow(ui, 'row-c:/work/demo/src/app.ts')
  expect(await hasText(ui, 'Claude sees')).toBe(true)
  for (const key of ['unselect', 'open-file', 'copy-path', 'copy-full']) {
    expect((await ui.find({ key }))?.props?.plain).toBe(true)
  }
  await ui.unmount()
})

test('Claude touched lists the files read and edited, newest first, with a pill while lit', async ($, on) => {
  const { clock } = world(on, { dirs: { ...DIRS, 'C:\\work\\demo': [['Src', 'dir'], ['README.md', 'file']] } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'touched' })).toBeUndefined()

  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\Src\\App.ts' })
  await $.turn.start({ text: 'w', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\demo\\README.md', content: 'x\n' })
  await clock.advance(200)
  expect(await hasText(ui, 'TOUCHED · 2')).toBe(true)
  expect(await ui.find({ key: 'touched-more' })).toBeUndefined()
  const rows = (await ui.findAll({ type: 'Client' })).map((c: any) => c.key).filter((k: string) => k?.startsWith('touched-'))
  expect(rows).toEqual(['touched-c:/work/demo/readme.md', 'touched-c:/work/demo/src/app.ts'])
  // The rows type themselves in on their own frame clock.
  await ui.advance(500)
  // Only the file Claude is on is lit: the one it left says what was done, unfilled.
  expect(await rowText(ui, rows[0])).toMatch(/^ MD  README\.md\s+Editing $/)
  expect(await rowText(ui, rows[1])).toMatch(/^ TS  App\.ts Src\s+Read $/)
  const pill = (await rowRuns(ui, rows[1])).find(r => r.text === ' Read ')
  expect(pill?.props.backgroundColor).toBeUndefined()

  // A click goes to the file in the tree, selected.
  await pressRow(ui, rows[1])
  await clock.settle()
  expect(await ui.find({ key: 'row-c:/work/demo/src/app.ts' })).toBeDefined()
  expect(await ui.find({ key: 'unselect' })).toBeDefined()
  await $.turn.complete({ ...DONE, turnId: 't1' })
  await ui.unmount()
})

test('Touched shows the latest three, and "+N more" opens the rest', async ($, on) => {
  const names = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md']
  const { clock } = world(on, { dirs: { 'C:\\work\\demo': names.map(n => [n, 'file'] as [string, 'file']) } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  for (const n of names) await $.tool.call({ tool: 'Read', file_path: `C:\\work\\demo\\${n}` })
  await clock.advance(200)
  const shown = async () => (await ui.findAll({ type: 'Client' })).map((c: any) => c.key).filter((k: string) => /^touched-c:/.test(k ?? ''))
  expect(await hasText(ui, 'TOUCHED · 5')).toBe(true)
  expect(await shown()).toEqual(['touched-c:/work/demo/e.md', 'touched-c:/work/demo/d.md', 'touched-c:/work/demo/c.md'])
  expect((await ui.find({ key: 'touched-more' }))?.props?.label).toBe('+2 more')

  await ui.press({ key: 'touched-more' })
  await clock.settle()
  expect((await shown()).length).toBe(5)
  expect((await ui.find({ key: 'touched-more' }))?.props?.label).toBe('fewer')
  await ui.unmount()
})

test('the crab takes a pose for what Claude does: asleep, then reading', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  // An Svg is found by its type (the kit addresses no key on it).
  expect((await ui.find({ type: 'Svg' }))?.props?.alt).toBe('Crab asleep: Claude is idle')
  await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\demo\\Src\\App.ts' })
  await clock.advance(200)
  const reading = await ui.find({ type: 'Svg' })
  expect(reading?.props?.alt).toBe('Crab reading App.ts')
  expect(String(reading?.props?.source)).toContain(BOOK_COLOR)
  await ui.unmount()
})

test('crabSvg: each pose its own drawing, at the card\'s size', () => {
  const sources = (['read', 'write', 'commit', 'idle', 'push', 'merge', 'delete'] as const).map(p => crabSvg(p, p).source)
  expect(new Set(sources).size).toBe(7)
  expect(crabSvg('idle', 'x')).toMatchObject({ width: CRAB_PX.width, height: CRAB_PX.height })
  for (const source of sources) expect(source).toContain('prefers-reduced-motion')
  // A push sends an arrow up in the git bar's teal; a merge joins two branches in its purple.
  expect(sources[4]).toContain(PUSH)
  expect(sources[4]).toContain('class="ar"')
  expect(sources[5]).toContain(MERGE)
  expect(sources[5]!.match(/class="mg"/g)?.length).toBe(2)
  // A delete crosses the page out in red.
  expect(sources[6]).toContain(GONE)
})

/** The crab's Svg: the card has the chips' icons in its title bar too. */
const crabOf = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props?.alt).startsWith('Crab'))
const GIT = { top: 'C:/work/demo', status: '## main\0', numstat: '' }

test('a push: the crab sends an arrow up and the pill says Pushed, then the card goes back to idle', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, git: GIT })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await clock.advance(200)
  expect(await hasText(ui, 'Pushed origin main')).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).some((t: any) => t.text === '\u00a0Pushed\u00a0')).toBe(true)
  expect(await ui.find({ key: 'now-card' })).toMatchObject({ props: { borderColor: STAGE_STYLE.push.color } })
  const crab = await crabOf(ui)
  expect(crab?.props?.alt).toBe('Crab pushed origin main')
  expect(String(crab?.props?.source)).toContain('class="ar"')
  // FLASH_MS after it is done, the crab puts it down.
  await clock.advance(FLASH_MS + 100)
  expect(await hasText(ui, 'Pushed origin main')).toBe(false)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab asleep: Claude is idle')
  await ui.unmount()
})

test('a merge: the crab joins two branches and the pill says Merged; a failed one says so in red, then goes', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, git: GIT })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Bash', command: 'git merge topic' })
  await clock.advance(200)
  expect(await hasText(ui, 'Merged topic')).toBe(true)
  expect(String((await crabOf(ui))?.props?.source)).toContain('class="mg"')
  await clock.advance(FLASH_MS + 100)
  await $.tool.call({ tool: 'Bash', command: 'git merge other --fail' })
  await clock.advance(200)
  expect(await hasText(ui, 'Merged other')).toBe(false)
  expect(await hasText(ui, 'Merge failed other')).toBe(true)
  expect(await ui.find({ key: 'now-card' })).toMatchObject({ props: { borderColor: GONE } })
  await clock.advance(FLASH_MS + 100)
  expect((await crabOf(ui))?.props?.alt).toBe('Crab asleep: Claude is idle')
  await ui.unmount()
})

test('the branch chip carries GitHub\'s branch icon, the latest git action its own; the terminal gets a glyph', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, git: GIT })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'chip-branch' })).toMatchObject({ type: 'Box', props: { backgroundColor: CHIP_BG } })
  const icons = async () => (await ui.findAll({ type: 'Svg' })).filter((s: any) => !String(s.props?.alt).startsWith('Crab'))
  expect((await icons()).map((s: any) => s.props.alt)).toEqual(['Branch'])
  expect(String((await icons())[0]!.props.source)).toContain(ICON_MUTED)
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await clock.advance(200)
  const pushed = await icons()
  expect(pushed.map((s: any) => s.props.alt)).toEqual(['Branch', 'push'])
  // A long action shrinks with the card and is cut, not run past its border (seen live).
  await $.tool.call({ tool: 'Bash', command: 'git switch feat/a-very-long-branch-name-for-the-card' })
  await clock.advance(200)
  const action = (await ui.findAll({ type: 'Box' })).find((b: any) => /^git-.*-words$/.test(String(b.key)))
  expect(action?.props).toMatchObject({ flexShrink: 1, minWidth: 0 })
  expect(JSON.stringify(action)).toContain('truncate-end')
  expect(String(pushed[1]!.props.source)).toContain(PUSH)
  await ui.unmount()

  const term = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect((await term.findAll({ type: 'Text' })).some((t: any) => String(t.text).includes(`${BRANCH_GLYPH} main`))).toBe(true)
  await term.unmount()
})

test('a touched file\'s badge takes its type\'s colour, as the tree\'s marker does; grey for a type not listed', async ($, on) => {
  const { clock } = world(on, { dirs: { 'C:\work\demo': [['app.ts', 'file'], ['Makefile', 'file']] }, files: { 'C:\work\demo\app.ts': 'a\n', 'C:\work\demo\Makefile': 'm\n' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/app.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/Makefile' } as never)
  await clock.advance(200)
  await ui.advance(500)
  const badge = async (key: string) => (await rowRuns(ui, key)).find(r => /^\s*[A-Z]{2,3}\s*$/.test(r.text))?.props.color
  expect(await badge('touched-c:/work/demo/app.ts')).toBe(typeColor('app.ts'))
  expect(await badge('touched-c:/work/demo/makefile')).toBe(GIT_HEX.muted)
  await ui.unmount()
})

test('the terminal paints no translucent fill: badges and the pill are solid with ink that contrasts, the crab is its own Client', async ($, on) => {
  const dirs: Record<string, [string, 'file' | 'dir'][]> = { 'C:\work\demo': [['app.ts', 'file']], 'C:/work/demo': [['app.ts', 'file']] }
  const { clock } = world(on, { dirs, files: { 'C:\work\demo\app.ts': 'a\n' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/work/demo/app.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.advance(200)
  await ui.advance(500)
  const fills = [...JSON.stringify(await ui.find({ key: 'now-card' })).matchAll(/"(?:backgroundColor|bg)":"(#[0-9a-fA-F]+)"/g)].map(m => m[1]!)
  expect(fills.filter(f => f.length > 7)).toEqual([])
  const badge = (await rowRuns(ui, 'touched-c:/work/demo/app.ts')).find(r => r.text.trim() === 'TS')
  expect(badge?.props).toMatchObject({ backgroundColor: typeColor('app.ts') })
  expect(badge?.props.color).not.toBe(typeColor('app.ts'))
  const pill = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text === '\u00a0Editing\u00a0')
  expect(pill?.props).toMatchObject({ backgroundColor: NOW_STYLE.write.color })
  expect(pill?.props.color).not.toBe(NOW_STYLE.write.color)
  expect(await ui.find({ key: 'crab-write' })).toMatchObject({ type: 'Client' })
  expect(await rowRuns(ui, 'crab-write')).toHaveLength(4)
  expect(await ui.find({ key: 'now-row' })).toMatchObject({ props: { marginTop: 1 } })
  await ui.unmount()
})

test('the terminal crab has a frame set for every pose, each 4 rows of 8 cells, stepping only when there is more than one', () => {
  expect(CRAB_ROWS).toHaveLength(4)
  for (const [pose, { frames, ms }] of Object.entries(TERM_FRAMES)) {
    expect(frames.length, pose).toBeGreaterThan(0)
    for (const rows of frames) {
      expect(rows, pose).toHaveLength(4)
      for (const row of rows) expect([...row], `${pose}: ${row}`).toHaveLength(8)
    }
    expect(ms > 0, pose).toBe(frames.length > 1)
  }
})

test('the terminal crab steps through its frames on its own clock, a new pose starting again, a still pose never ticking', { timeoutMs: 15_000 }, async ($, on) => {
  const dirs: Record<string, [string, 'file' | 'dir'][]> = { 'C:\\work\\demo': [['app.ts', 'file']], 'C:/work/demo': [['app.ts', 'file']] }
  const { clock } = world(on, { dirs, files: { 'C:\\work\\demo\\app.ts': 'a\n' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  const rows = async (key: string) => (await rowRuns(ui, key)).filter(r => r.props.color).map(r => r.text)
  // Idle: asleep, the z coming and going.
  const first = await rows('crab-idle')
  expect(first).toEqual([...TERM_FRAMES.idle.frames[0]!])
  await ui.advance(TERM_FRAMES.idle.ms + 100)
  expect(await rows('crab-idle')).toEqual([...TERM_FRAMES.idle.frames[1]!])
  // A read starts its own crab on its first frame.
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/demo/app.ts' } as never)
  await clock.advance(200)
  expect(await rows('crab-read')).toEqual([...TERM_FRAMES.read.frames[0]!])
  await ui.advance(TERM_FRAMES.read.ms + 100)
  expect(await rows('crab-read')).toEqual([...TERM_FRAMES.read.frames[1]!])
  await ui.unmount()
})
