// The crab in the activity card, in a pose for what Claude is doing: reading a book,
// writing with a pencil, cheering a commit, tearing up a deleted file, sending an
// arrow up on a push, joining two branches over its head on a merge, or asleep when idle. Drawn on the grid of
// the crab in the token-usage mod (by the same author): blocks on 16 by 12, a body of
// 8 by 6, two eyes, two arms ending in pincers, four legs, after the creature in
// Claude Code's banner. No engine calls here.

import type { GitPose, Tone } from '../types'

const CRAB = '#d97757'
const EYE = '#1f1e1d'
const BOOK = '#8b5cf6'
const SPINE = '#5b3fc4'
const PENCIL = '#e5c07b'
const CHECK = '#22c55e'
const ZED = '#808a96'
/** A deletion's red, the git status colour of a deleted file. */
export const GONE = '#ef4444'
/** Paper: a mid grey that shows on light and dark cards alike. */
const PAPER = '#a8b3c1'
/** The git bar's colours for these actions (KIND_SHIMMER's sync and merge), so the crab and its chip agree. */
export const PUSH = '#14b8a6'
export const MERGE = '#a855f7'
const WIDE = 16
const TALL = 12
/** Room above the crab, in blocks, for a pencil, a tick, an arrow, two branches or a z rising off it. */
const ABOVE = 3
/** Pixels a block takes in the card: 2, so the crab stands about a line and a half tall. */
export const CRAB_SCALE = 2
export const CRAB_PX = { width: WIDE * CRAB_SCALE, height: (TALL + ABOVE) * CRAB_SCALE }
/** The same creature in a terminal's blocks, for surfaces without an Svg. */
export const CRAB_ROWS = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const

export type Pose = Tone | GitPose | 'idle'

const block = (x: number, y: number, wide: number, tall: number, fill = CRAB, name = '') =>
  `<rect${name ? ` class="${name}"` : ''} x="${x}" y="${y}" width="${wide}" height="${tall}" fill="${fill}"/>`

// Arms, drawn for the left side; the right is their mirror.
const ARMS = {
  down: block(2, 6, 2, 2) + block(0, 5, 2, 1) + block(1, 6, 1, 1) + block(0, 7, 2, 1),
  up: block(2, 4, 2, 2) + block(0, 1, 1, 2) + block(2, 1, 1, 2) + block(0, 3, 3, 1),
  tucked: block(3, 6, 1, 2),
}
const EYES = {
  tall: block(6, 5, 1, 2, EYE) + block(9, 5, 1, 2, EYE),
  // Looking down, at the page.
  down: block(5, 6, 2, 1, EYE) + block(9, 6, 2, 1, EYE),
  glad: block(5, 5, 2, 1, EYE) + block(9, 5, 2, 1, EYE),
  shut: block(5, 6, 2, 0.6, EYE) + block(9, 6, 2, 0.6, EYE),
}
const LEGS = [4, 6, 9, 11].map(x => block(x, 9, 1, 2)).join('')
const BODY = block(4, 3, 8, 6)

type Look = { arms: readonly [keyof typeof ARMS, keyof typeof ARMS]; eyes: keyof typeof EYES; prop: string; moves: string }

const LOOKS: Record<Pose, Look> = {
  // A book held open in front, its pages turning.
  read: {
    arms: ['down', 'down'],
    eyes: 'down',
    prop: `<g class="bk">${block(4, 7, 8, 3, BOOK)}${block(7.7, 7, 0.6, 3, SPINE)}</g>${block(8.3, 7.4, 3, 0.4, '#c4b5fd', 'pg')}`,
    moves: '.pg{transform-origin:8.3px 7.6px;animation:pg 1.6s ease-in-out infinite}@keyframes pg{0%,60%{transform:none}80%{transform:scaleX(-1)}100%{transform:scaleX(-1);opacity:0}}',
  },
  // A pencil raised in the right pincer, scribbling.
  write: {
    arms: ['down', 'up'],
    eyes: 'tall',
    prop: `<g class="pn">${block(14.5, -2.5, 1, 4, PENCIL)}${block(14.5, 1.5, 1, 0.8, EYE)}</g>`,
    moves: '.pn{transform-origin:15px 2px;animation:pn .5s ease-in-out infinite}@keyframes pn{50%{transform:rotate(-14deg)}}',
  },
  // Both arms up, a tick popping above.
  commit: {
    arms: ['up', 'up'],
    eyes: 'glad',
    prop: `<path class="ck" d="M5.5 -0.5 L7.3 1 L10.8 -2.5" stroke="${CHECK}" stroke-width="1.1" fill="none"/>`,
    moves: '.ck{animation:ck 1.2s ease-out infinite}@keyframes ck{0%{opacity:0;transform:translateY(1px)}30%,80%{opacity:1;transform:none}100%{opacity:0}}',
  },
  // Looking down at a file it tore up: a red cross over the page, its scraps falling.
  delete: {
    arms: ['down', 'down'],
    eyes: 'down',
    prop: `<g class="tr">${block(5, 7, 6, 3, PAPER)}</g><path class="x" d="M6 -2.5 L10 1.5 M10 -2.5 L6 1.5" stroke="${GONE}" stroke-width="1.1" fill="none"/>${block(2, 10, 1, 1, PAPER, 'sc')}${block(13, 10, 1, 1, PAPER, 'sc s2')}`,
    moves: '.x{animation:x 1.2s ease-out infinite}@keyframes x{0%{opacity:0;transform:scale(.6)}30%,80%{opacity:1;transform:none}100%{opacity:0}}.x{transform-origin:8px -0.5px}.sc{animation:sc 1.2s ease-in infinite}.s2{animation-delay:.6s}@keyframes sc{0%{opacity:1;transform:none}100%{opacity:0;transform:translateY(1.5px)}}',
  },
  // Both arms up, an arrow sent up off its pincers, again and again, as the commits go.
  push: {
    arms: ['up', 'up'],
    eyes: 'tall',
    prop: `<g class="ar">${block(7.5, -1.5, 1, 3, PUSH)}${block(6.5, -2.5, 3, 1, PUSH)}${block(7.5, -3, 1, 0.5, PUSH)}</g>`,
    moves: '.ar{animation:ar .9s ease-in infinite}@keyframes ar{0%{opacity:0;transform:translateY(2px)}30%{opacity:1}100%{opacity:0;transform:translateY(-2px)}}',
  },
  // Both arms up, a branch drawn from each pincer, the two joining over its head with a dot.
  merge: {
    arms: ['up', 'up'],
    eyes: 'glad',
    prop: ['M1.5 0.5 L8 -1.5 V-3', 'M14.5 0.5 L8 -1.5 V-3'].map(d => `<path class="mg" d="${d}" pathLength="1" stroke-dasharray="1" stroke="${MERGE}" stroke-width="0.9" fill="none" stroke-linecap="round" shape-rendering="geometricPrecision"/>`).join('') + `<circle class="dt" cx="8" cy="-1.5" r="0.9" fill="${MERGE}" shape-rendering="geometricPrecision"/>`,
    moves: '.mg{animation:mg 1.4s ease-out infinite}@keyframes mg{0%{stroke-dashoffset:1;opacity:1}45%{stroke-dashoffset:0}85%{opacity:1}100%{stroke-dashoffset:0;opacity:0}}.dt{transform-origin:8px -1.5px;animation:dt 1.4s ease-out infinite}@keyframes dt{0%,40%{opacity:0;transform:scale(0)}55%{opacity:1;transform:scale(1.3)}65%,85%{opacity:1;transform:none}100%{opacity:0}}',
  },
  // Asleep: arms tucked, breathing, z rising.
  idle: {
    arms: ['tucked', 'tucked'],
    eyes: 'shut',
    prop: `<text class="zz" x="12.5" y="1" font-size="3" font-family="sans-serif" fill="${ZED}">z</text><text class="zz z2" x="14" y="-1" font-size="2.2" font-family="sans-serif" fill="${ZED}">z</text>`,
    moves: '.all{transform-origin:8px 11px;animation:br 2.4s ease-in-out infinite}@keyframes br{50%{transform:scale(1,.94)}}.zz{animation:zz 2.4s ease-in infinite}.z2{animation-delay:1.2s}@keyframes zz{0%{opacity:0;transform:translate(-1px,1px)}40%{opacity:1}100%{opacity:0;transform:translate(1px,-1.5px)}}',
  },
}

/** The crab in a pose, as an Svg's source; motion stops for a reader who asked for less. */
export function crabSvg(pose: Pose, alt: string): { source: string; alt: string; width: number; height: number } {
  const { arms, eyes, prop, moves } = LOOKS[pose]
  const right = `<g transform="translate(${WIDE} 0) scale(-1 1)">${ARMS[arms[1]]}</g>`
  const crab = `<g class="all">${ARMS[arms[0]]}${right}${BODY}${EYES[eyes]}${LEGS}</g>`
  return {
    source: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CRAB_PX.width}" height="${CRAB_PX.height}" viewBox="0 ${-ABOVE} ${WIDE} ${TALL + ABOVE}" shape-rendering="crispEdges">`,
      `<style>${moves}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`,
      crab,
      prop,
      '</svg>',
    ].join(''),
    alt,
    width: CRAB_PX.width,
    height: CRAB_PX.height,
  }
}
