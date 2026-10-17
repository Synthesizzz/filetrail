import { expect, test } from 'claude-code/testing'

import { world } from './world'

const PANE = {
  component: 'Pane',
  requestId: 'filetrail',
  props: {
    title: 'Trail: demo',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const
const FILES_EMPTY = 'Reading the folder…'
const HISTORY_EMPTY = 'No edits recorded yet.'
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

test('the pane opens on Files and its tabs switch views', async ($, on) => {
  world(on)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'filetrail', surface, ...PANE })
    expect(await ui.find({ key: 'tab-files' })).toBeDefined()
    expect(await ui.find({ key: 'tab-history' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: FILES_EMPTY })).toBeDefined()

    await ui.press({ key: 'tab-history' })
    expect(await ui.find({ type: 'Text', text: HISTORY_EMPTY })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: FILES_EMPTY })).toBeUndefined()

    await ui.press({ key: 'tab-files' })
    expect(await ui.find({ type: 'Text', text: FILES_EMPTY })).toBeDefined()
    await ui.unmount()
  }
})

test('/trail opens the pane with the folder name in its title', async ($, on) => {
  const opened: unknown[] = []
  on('session.cwd', () => ({ value: 'C:/work/demo' }))
  on('ui.open', (_$, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  const r = await $.command.run({ ...TYPED, command: 'trail', args: '' })
  expect(r.text).toBe('filetrail opened.')
  expect(opened).toEqual([{ id: 'filetrail', title: 'Trail: demo', focus: true }])
})
