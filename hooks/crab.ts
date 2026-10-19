// The crab in the activity card, in a pose for what Claude is doing: reading a book,
// writing with a pencil, cheering a commit, tearing up a deleted file, sending an
// arrow up on a push, joining two branches over its head on a merge, sweeping a
// magnifying glass on a search, typing at a tiny terminal, checking a clipboard of
// tests (then cheering or sweating), dizzy after an error, thinking with a bubble,
// working beside a little helper crab, or asleep when idle. Drawn on the grid of
// the crab in the token-usage mod (by the same author): blocks on 16 by 12, a body of
// 8 by 6, two eyes, two arms ending in pincers, four legs, after the creature in
// Claude Code's banner. No engine calls here.

import type { StagePose, Tone } from '../types'

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
/** The new poses' colours, each readable on light and dark cards. */
export const SEARCH = '#f59e0b'
export const COMMAND = '#0ea5e9'
export const TEST = '#3b82f6'
export const AGENT = '#ec4899'
const SCREEN = '#334155'
const SWEAT = '#60a5fa'
const STAR = '#facc15'
const WIDE = 16
const TALL = 12
/** Room above the crab, in blocks, for a pencil, a tick, an arrow, two branches or a z rising off it. */
const ABOVE = 3
/** Pixels a block takes in the card: 2, so the crab stands about a line and a half tall. */
export const CRAB_SCALE = 2
export const CRAB_PX = { width: WIDE * CRAB_SCALE, height: (TALL + ABOVE) * CRAB_SCALE }
/** The same creature in a terminal's blocks, for surfaces without an Svg. */
export const CRAB_ROWS = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '] as const

/** A pose: a file's tone, a stage, tests that `passed` or `failed`, Claude thinking, or idle. */
export type Pose = Tone | StagePose | 'passed' | 'failed' | 'think' | 'idle'

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
  // Crossed out, dizzy.
  x: `<path d="M5 5 L7 7 M7 5 L5 7 M9 5 L11 7 M11 5 L9 7" stroke="${EYE}" stroke-width="0.6" fill="none" shape-rendering="geometricPrecision"/>`,
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
  // A magnifying glass raised in the right pincer, sweeping side to side.
  search: {
    arms: ['down', 'up'],
    eyes: 'tall',
    prop: `<g class="mg2" shape-rendering="geometricPrecision"><circle cx="13" cy="-1" r="1.5" stroke="${SEARCH}" stroke-width="0.7" fill="#fde68a55"/><path d="M14 0 L15.3 1.5" stroke="${SEARCH}" stroke-width="0.8"/></g>`,
    moves: '.mg2{animation:mg2 1.4s ease-in-out infinite}@keyframes mg2{50%{transform:translateX(-3px)}}',
  },
  // Typing at a tiny terminal held in front, its cursor blinking.
  command: {
    arms: ['down', 'down'],
    eyes: 'down',
    prop: `${block(4, 7, 8, 3, SCREEN)}${block(5, 7.6, 1.6, 0.5, COMMAND)}${block(7, 7.6, 2.4, 0.5, '#94a3b8')}${block(5, 8.6, 1, 0.8, CHECK, 'cu')}`,
    moves: '.cu{animation:cu 1s steps(1) infinite}@keyframes cu{50%{opacity:0}}',
  },
  // A clipboard of tests, its lines ticked off one by one.
  test: {
    arms: ['down', 'down'],
    eyes: 'down',
    prop: `${block(5, 6.5, 6, 4, PAPER)}${block(7, 6, 2, 0.8, SCREEN)}${block(6, 7.6, 3.5, 0.5, TEST, 'l1')}${block(6, 8.6, 3.5, 0.5, TEST, 'l2')}${block(6, 9.6, 3.5, 0.5, TEST, 'l3')}`,
    moves: '.l1,.l2,.l3{animation:ln 1.5s steps(1) infinite}.l2{animation-delay:.5s}.l3{animation-delay:1s}@keyframes ln{0%{opacity:.25}33%,100%{opacity:1}}',
  },
  // Tests passed: both arms up, a tick and two twinkling stars.
  passed: {
    arms: ['up', 'up'],
    eyes: 'glad',
    prop: `<path class="ck" d="M5.5 -0.5 L7.3 1 L10.8 -2.5" stroke="${CHECK}" stroke-width="1.1" fill="none"/>${block(2, -2, 1, 1, STAR, 'tw')}${block(13, -1.5, 1, 1, STAR, 'tw t2')}`,
    moves: '.ck{animation:ck 1.2s ease-out infinite}@keyframes ck{0%{opacity:0;transform:translateY(1px)}30%,80%{opacity:1;transform:none}100%{opacity:0}}.tw{animation:tw .8s ease-in-out infinite}.t2{animation-delay:.4s}@keyframes tw{50%{opacity:.2}}',
  },
  // Tests failed: drops of sweat running down either side.
  failed: {
    arms: ['down', 'down'],
    eyes: 'tall',
    prop: `${block(3, 2, 0.8, 1.2, SWEAT, 'sw')}${block(12.4, 1.5, 0.8, 1.2, SWEAT, 'sw s2')}<path d="M7 -2.5 L9 -0.5 M9 -2.5 L7 -0.5" stroke="${GONE}" stroke-width="0.9" fill="none"/>`,
    moves: '.sw{animation:sw 1.1s ease-in infinite}.s2{animation-delay:.55s}@keyframes sw{0%{opacity:0;transform:none}20%{opacity:1}100%{opacity:0;transform:translateY(2.5px)}}',
  },
  // After an error: eyes crossed out, stars circling its head.
  error: {
    arms: ['tucked', 'tucked'],
    eyes: 'x',
    prop: `<g class="st">${block(5, -1, 1, 1, STAR)}${block(10, -1.5, 1, 1, STAR)}${block(8, -2.6, 1, 1, STAR)}</g>`,
    moves: '.st{transform-origin:8px -1px;animation:st 1.6s linear infinite}@keyframes st{to{transform:rotate(360deg)}}',
  },
  // Thinking: a bubble of three dots filling in turn.
  think: {
    arms: ['tucked', 'tucked'],
    eyes: 'tall',
    prop: `${block(11.5, 2, 0.8, 0.8, ZED)}${block(12.6, 0.4, 1, 1, ZED)}${block(10.5, -2.4, 1, 1, ZED, 'd1')}${block(12.3, -2.4, 1, 1, ZED, 'd2')}${block(14.1, -2.4, 1, 1, ZED, 'd3')}`,
    moves: '.d1,.d2,.d3{animation:dt3 1.2s steps(1) infinite}.d2{animation-delay:.4s}.d3{animation-delay:.8s}@keyframes dt3{0%{opacity:.2}33%,100%{opacity:1}}',
  },
  // A helper at work: a little crab beside it, hopping.
  agent: {
    arms: ['down', 'tucked'],
    eyes: 'glad',
    prop: `<g class="hp">${block(12.8, 7.5, 3, 2, AGENT)}${block(13.4, 8, 0.6, 0.6, EYE)}${block(14.6, 8, 0.6, 0.6, EYE)}${block(13.2, 9.5, 0.6, 1, AGENT)}${block(15, 9.5, 0.6, 1, AGENT)}</g>`,
    moves: '.hp{animation:hp .7s ease-in-out infinite}@keyframes hp{50%{transform:translateY(-1px)}}',
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
