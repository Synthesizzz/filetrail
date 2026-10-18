// GitHub's own git icons, for the branch chip and the git actions in the card's title bar.
// The paths are Octicons at 16px (@primer/octicons 19.8.0, MIT, GitHub Inc.); see NOTICE.
// Every number is written out and spaced: the engine scrubs an Svg's markup on each draw,
// and the compact form (".75.75", arcs run together) made that scrub slow (measured: the
// test suite timed out with it, and ran as fast as without icons once spaced).
// No engine calls here.

import type { GitIcon } from '../types'

const PATHS: Record<GitIcon, readonly string[]> = {
  branch: ['M 9.5 3.25 a 2.25 2.25 0 1 1 3 2.122 V 6 A 2.5 2.5 0 0 1 10 8.5 H 6 a 1 1 0 0 0 -1 1 v 1.128 a 2.251 2.251 0 1 1 -1.5 0 V 5.372 a 2.25 2.25 0 1 1 1.5 0 v 1.836 A 2.493 2.493 0 0 1 6 7 h 4 a 1 1 0 0 0 1 -1 v -0.628 A 2.25 2.25 0 0 1 9.5 3.25 Z m -6 0 a 0.75 0.75 0 1 0 1.5 0 0.75 0.75 0 0 0 -1.5 0 Z m 8.25 -0.75 a 0.75 0.75 0 1 0 0 1.5 0.75 0.75 0 0 0 0 -1.5 Z M 4.25 12 a 0.75 0.75 0 1 0 0 1.5 0.75 0.75 0 0 0 0 -1.5 Z'],
  merge: ['M 5.45 5.154 A 4.25 4.25 0 0 0 9.25 7.5 h 1.378 a 2.251 2.251 0 1 1 0 1.5 H 9.25 A 5.734 5.734 0 0 1 5 7.123 v 3.505 a 2.25 2.25 0 1 1 -1.5 0 V 5.372 a 2.25 2.25 0 1 1 1.95 -0.218 Z M 4.25 13.5 a 0.75 0.75 0 1 0 0 -1.5 0.75 0.75 0 0 0 0 1.5 Z m 8.5 -4.5 a 0.75 0.75 0 1 0 0 -1.5 0.75 0.75 0 0 0 0 1.5 Z M 5 3.25 a 0.75 0.75 0 1 0 0 0.005 V 3.25 Z'],
  commit: ['M 11.93 8.5 a 4.002 4.002 0 0 1 -7.86 0 H 0.75 a 0.75 0.75 0 0 1 0 -1.5 h 3.32 a 4.002 4.002 0 0 1 7.86 0 h 3.32 a 0.75 0.75 0 0 1 0 1.5 Z m -1.43 -0.75 a 2.5 2.5 0 1 0 -5 0 2.5 2.5 0 0 0 5 0 Z'],
  push: ['M 1 2.5 A 2.5 2.5 0 0 1 3.5 0 h 8.75 a 0.75 0.75 0 0 1 0.75 0.75 v 3.5 a 0.75 0.75 0 0 1 -1.5 0 V 1.5 h -8 a 1 1 0 0 0 -1 1 v 6.708 A 2.493 2.493 0 0 1 3.5 9 h 3.25 a 0.75 0.75 0 0 1 0 1.5 H 3.5 a 1 1 0 0 0 0 2 h 5.75 a 0.75 0.75 0 0 1 0 1.5 H 3.5 A 2.5 2.5 0 0 1 1 11.5 Z m 13.23 7.79 h -0.001 l -1.224 -1.224 v 6.184 a 0.75 0.75 0 0 1 -1.5 0 V 9.066 L 10.28 10.29 a 0.75 0.75 0 0 1 -1.06 -1.061 l 2.505 -2.504 a 0.75 0.75 0 0 1 1.06 0 L 15.29 9.23 a 0.751 0.751 0 0 1 -0.018 1.042 0.751 0.751 0 0 1 -1.042 0.018 Z'],
  pull: [
    'M 1 2.5 A 2.5 2.5 0 0 1 3.5 0 h 8.75 a 0.75 0.75 0 0 1 0.75 0.75 V 6 a 0.75 0.75 0 0 1 -1.5 0 V 1.5 h -8 a 1 1 0 0 0 -1 1 v 6.708 A 2.486 2.486 0 0 1 3.5 9 h 3 a 0.75 0.75 0 0 1 0 1.5 h -3 a 1 1 0 0 0 0 2 h 3 a 0.75 0.75 0 0 1 0 1.5 h -3 A 2.5 2.5 0 0 1 1 11.5 v -9 Z',
    'M 12.21 13.479 a 0.75 0.75 0 1 0 1.061 1.061 l 2.504 -2.505 a 0.75 0.75 0 0 0 0 -1.061 L 13.271 8.47 a 0.75 0.75 0 0 0 -1.061 1.06 l 1.224 1.225 H 8.75 a 0.75 0.75 0 1 0 0 1.5 h 4.685 l -1.225 1.224 Z',
  ],
  pr: ['M 1.5 3.25 a 2.25 2.25 0 1 1 3 2.122 v 5.256 a 2.251 2.251 0 1 1 -1.5 0 V 5.372 A 2.25 2.25 0 0 1 1.5 3.25 Z m 5.677 -0.177 L 9.573 0.677 A 0.25 0.25 0 0 1 10 0.854 V 2.5 h 1 A 2.5 2.5 0 0 1 13.5 5 v 5.628 a 2.251 2.251 0 1 1 -1.5 0 V 5 a 1 1 0 0 0 -1 -1 h -1 v 1.646 a 0.25 0.25 0 0 1 -0.427 0.177 L 7.177 3.427 a 0.25 0.25 0 0 1 0 -0.354 Z M 3.75 2.5 a 0.75 0.75 0 1 0 0 1.5 0.75 0.75 0 0 0 0 -1.5 Z m 0 9.5 a 0.75 0.75 0 1 0 0 1.5 0.75 0.75 0 0 0 0 -1.5 Z m 8.25 0.75 a 0.75 0.75 0 1 0 1.5 0 0.75 0.75 0 0 0 -1.5 0 Z'],
  stash: ['M 7.122 0.392 a 1.75 1.75 0 0 1 1.756 0 l 5.003 2.902 c 0.83 0.481 0.83 1.68 0 2.162 L 8.878 8.358 a 1.75 1.75 0 0 1 -1.756 0 L 2.119 5.456 a 1.251 1.251 0 0 1 0 -2.162 Z M 8.125 1.69 a 0.248 0.248 0 0 0 -0.25 0 l -4.63 2.685 4.63 2.685 a 0.248 0.248 0 0 0 0.25 0 l 4.63 -2.685 Z M 1.601 7.789 a 0.75 0.75 0 0 1 1.025 -0.273 l 5.249 3.044 a 0.248 0.248 0 0 0 0.25 0 l 5.249 -3.044 a 0.75 0.75 0 0 1 0.752 1.298 l -5.248 3.044 a 1.75 1.75 0 0 1 -1.756 0 L 1.874 8.814 A 0.75 0.75 0 0 1 1.6 7.789 Z m 0 3.5 a 0.75 0.75 0 0 1 1.025 -0.273 l 5.249 3.044 a 0.248 0.248 0 0 0 0.25 0 l 5.249 -3.044 a 0.75 0.75 0 0 1 0.752 1.298 l -5.248 3.044 a 1.75 1.75 0 0 1 -1.756 0 l -5.248 -3.044 a 0.75 0.75 0 0 1 -0.273 -1.025 Z'],
}

/**
 * Element tables whose Svg draws nothing: the terminal's carries one that comes out an
 * empty Box (seen in the test kit), so the render marks it and the drawings fall back
 * to words (the crab to its blocks, the branch icon to a glyph).
 */
export const NO_SVG = new WeakSet<object>()

/** The table's Svg, unless the surface draws none. */
export function svgOf<E extends object>(els: E): (E extends { Svg: infer S } ? S : never) | undefined {
  return 'Svg' in els && !NO_SVG.has(els) ? (els as { Svg: never }).Svg : undefined
}

/** Pixels an icon takes in a chip: a little under the line, as GitHub sets it beside a branch name. */
export const ICON_PX = 14

/** An Octicon as an Svg's source, filled in `color` (a hex: an image cannot read the theme's keys). */
export function octicon(icon: GitIcon, color: string, alt: string): { source: string; alt: string; width: number; height: number } {
  const paths = PATHS[icon].map(d => `<path d="${d}"/>`).join('')
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 16 16" fill="${color}">${paths}</svg>`,
    alt,
    width: ICON_PX,
    height: ICON_PX,
  }
}
