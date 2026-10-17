// The band above the prompt: after a turn that changed files, one line that
// offers to replay it. The band is shared, so what the plugins beneath draw
// stays above the line. (The offer after a turn is Replay Theater's idea.)

import type { EngineInterface } from 'claude-code'

import type { Hint, Turn } from '../types'

type Els = ReturnType<EngineInterface['ui']['resolve']>

/** The band's offer for a finished turn, or null when it changed no file. */
export function hintFor(turn: Turn): Hint | null {
  if (!turn.steps.length) return null
  return { turn: turn.id, edits: turn.steps.length, files: new Set(turn.steps.map(s => s.path.toLowerCase())).size }
}

export function hintText(hint: Hint): string {
  return `▶ filetrail: ${hint.edits} edit${hint.edits === 1 ? '' : 's'} in ${hint.files} file${hint.files === 1 ? '' : 's'}`
}

/** The offer's row; the caller draws it under whatever the plugins beneath drew. */
export function hintRow(els: Els, hint: Hint, replay: () => void) {
  const { Box, Text, Button } = els
  return (
    <Box key="filetrail-hint" flexDirection="row" gap={2} paddingX={1}>
      <Text color="claude" bold>{hintText(hint)}</Text>
      <Button key="replay" label="Replay" hotkey="r" onPress={replay} />
    </Box>
  )
}
