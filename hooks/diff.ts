// Line diff for filetrail's history steps.
//
// Adapted from Replay Theater (claude-code-playground, mods/replay-theater):
//   Copyright 2026 Anthropic PBC
//   SPDX-License-Identifier: Apache-2.0
// Changes: typed for TypeScript, context width as a parameter, a cap on the
// lines kept with a count of what was dropped.

import type { DiffLine } from '../types'

/** Inputs longer than this skip the LCS table: all removed, then all added. */
export const MAX_LCS_LINES = 400

export function splitLines(text: string | undefined | null): string[] {
  if (text === undefined || text === null || text === '') return []
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** A line diff with `context` unchanged lines kept around each change. */
export function diffLines(oldText: string | undefined, newText: string | undefined, context = 1): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    return [...a.map(t => ({ op: '-' as const, t })), ...b.map(t => ({ op: '+' as const, t }))]
  }
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: ' ', t: a[i]! }); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ op: '-', t: a[i++]! })
    else out.push({ op: '+', t: b[j++]! })
  }
  while (i < n) out.push({ op: '-', t: a[i++]! })
  while (j < m) out.push({ op: '+', t: b[j++]! })
  return trimContext(out, context)
}

/** Keeps `context` unchanged lines around each change; a skipped run becomes one `~` line. */
export function trimContext(lines: DiffLine[], context = 1): DiffLine[] {
  const changed = lines.map(l => l.op !== ' ')
  if (!changed.some(Boolean)) return []
  const keep = lines.map((_, k) => {
    for (let d = -context; d <= context; d++) if (changed[k + d]) return true
    return false
  })
  const out: DiffLine[] = []
  let skipped = false
  lines.forEach((l, k) => {
    if (keep[k]) {
      if (skipped && out.length) out.push({ op: '~', t: '⋯' })
      out.push(l)
      skipped = false
    } else skipped = true
  })
  return out
}

export function countChanges(diff: readonly DiffLine[]): { add: number; del: number } {
  let add = 0
  let del = 0
  for (const l of diff) {
    if (l.op === '+') add++
    else if (l.op === '-') del++
  }
  return { add, del }
}

/** Keeps the first `max` lines; the rest become one `~` line that says how many were dropped. */
export function capDiff(diff: DiffLine[], max: number): DiffLine[] {
  if (diff.length <= max) return diff
  return [...diff.slice(0, max), { op: '~', t: `… ${diff.length - max} more lines` }]
}
