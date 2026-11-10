// The tree's two views, All and Now, as tabs. A desktop Button draws as plain words and says
// nothing about which one is chosen (seen live: "All Now" read as a caption), so the tabs are
// drawn by the surface: the chosen one has a fill, the other is dim, and Now carries how many
// files this turn holds. A press posts the view it chose, and the hooks module switches.

import type { ClientModule } from 'claude-code'

import { NBSP } from './paths'

export type ModeId = 'all' | 'now'
/**
 * `count`: the files Now holds. `plain`: a surface that paints a fill opaque (the terminal), where
 * the chosen tab is bracketed instead.
 */
export type ModesProps = { mode: ModeId; count?: number; plain?: boolean }
/** What a press posts. */
export type ModePost = { mode: ModeId }

/** The chosen tab's fill: a grey that reads on light and dark backgrounds alike. */
export const TAB_FILL = '#80808055'

export type ModeLabel = { id: ModeId; text: string }

/**
 * The two tabs' words, each in padded cells (non-breaking spaces: a surface may collapse plain
 * ones). Both keep their width whichever is chosen, so nothing shifts under the pointer.
 */
export function modeLabels(mode: ModeId, count: number, plain: boolean): ModeLabel[] {
  const now = `Now${count > 0 ? ` ${count}` : ''}`
  const cell = (id: ModeId, words: string): ModeLabel => ({
    id,
    text: plain && mode === id ? `[${words}]` : `${NBSP}${words}${NBSP}`,
  })
  return [cell('all', 'All'), cell('now', now)]
}

/** Which tab a column falls on: the cells sit from the left, a column apart; undefined between and after. */
export function modeAt(x: number, labels: readonly ModeLabel[]): ModeId | undefined {
  let from = 0
  for (const l of labels) {
    const width = [...l.text].length
    if (x >= from && x < from + width) return l.id
    from += width + 1
  }
  return undefined
}

const Modes: ClientModule<ModesProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  const labels = modeLabels(props.mode, props.count ?? 0, props.plain === true)
  surface.onPointer(e => {
    if (e.type !== 'down' || (e.button ?? 'left') !== 'left') return
    const id = modeAt(e.x, labels)
    if (id !== undefined) surface.post({ mode: id } satisfies ModePost)
  })
  // The cells sit a column apart, from the left.
  return (
    <Box flexDirection="row">
      {labels.map((l, i) => (
        <Box key={l.id} flexDirection="row">
          {i > 0 ? <Text>{NBSP}</Text> : null}
          {l.id === props.mode
            ? <Text mono weight="semibold" {...(props.plain ? {} : { backgroundColor: TAB_FILL })}>{l.text}</Text>
            : <Text mono dimColor>{l.text}</Text>}
        </Box>
      ))}
    </Box>
  )
}

export default Modes
