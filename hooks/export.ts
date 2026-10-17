// Text filetrail hands out: one step quoted for the prompt box, and a
// project's whole history as Markdown. No engine calls here.

import type { DiffLine, Step, Turn } from '../types'
import { normPath } from './history'

/** Diff lines quoted into the prompt at most; the rest are counted. */
export const ASK_MAX_LINES = 40

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-17 17:05" in the machine's local time. */
export function stamp(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "20261017-1705": a stamp safe in a file name. */
export function fileStamp(at: number): string {
  return stamp(at).replace(/-/g, '').replace(' ', '-').replace(':', '')
}

/** A file-name-safe name for a project from its root folder. */
export function projectName(root: string): string {
  const name = normPath(root).replace(/\/+$/, '').split('/').pop() || 'project'
  return name.replace(/[^A-Za-z0-9._-]+/g, '-')
}

function diffBlock(diff: readonly DiffLine[], max = Infinity): string[] {
  const shown = diff.slice(0, max)
  const lines = shown.map(l => (l.op === '~' ? `  ${l.t}` : `${l.op} ${l.t}`))
  if (diff.length > shown.length) lines.push(`  … ${diff.length - shown.length} more lines`)
  return ['```diff', ...lines, '```']
}

function stepLine(step: Step): string {
  const bits = [step.tool, step.note, step.status === 'ok' ? '' : step.status, `+${step.add} -${step.del}`].filter(Boolean)
  return bits.join(' · ')
}

/** One step quoted for the prompt box, ending in a blank line for the question. */
export function askText(step: Step, turn: Turn): string {
  return [
    `About this edit Claude made earlier:`,
    `File: ${step.rel}${step.line !== null ? ` (line ${step.line})` : ''}`,
    `Turn: ${stamp(turn.at)}${turn.prompt ? ` "${turn.prompt}"` : ''}`,
    stepLine(step),
    ...diffBlock(step.diff, ASK_MAX_LINES),
    '',
    '',
  ].join('\n')
}

/** A project's history as Markdown, oldest turn first. */
export function historyMarkdown(root: string, turns: readonly Turn[], now: number): string {
  const out = [
    `# filetrail history: ${projectName(root)}`,
    '',
    `Project: \`${normPath(root)}\``,
    `Exported: ${stamp(now)}`,
    `Turns: ${turns.length}, edits: ${turns.reduce((n, t) => n + t.steps.length, 0)}`,
  ]
  for (const turn of turns) {
    out.push('', `## ${stamp(turn.at)} · ${turn.prompt || '(no prompt)'}`)
    for (const step of turn.steps) {
      out.push('', `### ${step.rel}${step.line !== null ? ` (line ${step.line})` : ''}`, '', stepLine(step), '', ...diffBlock(step.diff))
    }
  }
  return out.join('\n') + '\n'
}
