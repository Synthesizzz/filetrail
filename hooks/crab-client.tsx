// The Now card's crab on a surface with no Svg, drawn by the surface itself so it can
// move: the pose's frames in blocks, stepped on the surface's own clock. A pose with
// one frame draws once and starts no clock. The card keys it by pose, so a new pose is a
// new instance that starts from its first frame.

import type { ClientModule } from 'claude-code'

import { TERM_FRAMES } from './crab'
import type { Pose } from './crab'

export type CrabProps = { pose: Pose; color: string }
type Local = { n: number }

const Crab: ClientModule<CrabProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const look = TERM_FRAMES[props.pose] ?? TERM_FRAMES.idle
  let state = surface.state
  if (state === undefined) {
    state = { n: 0 }
    surface.setState(state)
    // Started once, as the instance first draws; it ends with the instance.
    if (look.frames.length > 1) {
      surface.every(look.ms, () => {
        const cur = surface.state
        if (cur) surface.setState({ n: cur.n + 1 })
      })
    }
  }
  const rows = look.frames[state.n % look.frames.length]!
  return (
    <Box flexDirection="column" flexShrink={0}>
      {rows.map((row, i) => <Text key={`crab-${i}`} color={props.color}>{row}</Text>)}
    </Box>
  )
}

export default Crab
