// The test runs of a session, for the card to keep after the chip is gone: the last one, and
// the last per-file and full ones, so a run of one file that passes beside a full run that
// fails shows. A guess from the command's words alone. No engine calls here.

import type { TestRun, TestRuns } from '../types'
import { runsTests, splitCommands, tokenize } from './bash'

/** A word naming one source file, or one test inside it (`tests/test_a.py::test_x`, `a.test.ts:12`). */
const FILE_ARG = /\.(py|js|jsx|ts|tsx|mjs|cjs|go|rs|rb|php|java|cs)(::.*|:\d+)?$/i
/** Flags that pick tests by name: a subset of the suite, though no file is named. */
const FILTER_FLAGS = new Set(['-k', '-t', '-m', '-run', '--run', '--grep', '--filter', '--testNamePattern', '--test-name-pattern', '--testPathPattern', '--tests', '--test'])

/**
 * `file` when the command that runs tests names a test file or picks tests by name, `full`
 * otherwise (a folder, `.`, `./...` or nothing is the whole suite).
 */
export function testScope(command: string): TestRun['scope'] {
  for (const segment of splitCommands(command)) {
    const words = tokenize(segment)
    if (!words) continue
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words.shift()
    if (!words.length || !runsTests(words)) continue
    for (const w of words.slice(1)) {
      const flag = w.split('=')[0]!
      if (FILTER_FLAGS.has(flag)) return 'file'
      if (!w.startsWith('-') && FILE_ARG.test(w.replace(/\\/g, '/'))) return 'file'
    }
  }
  return 'full'
}

/** 840 as `840ms`, 3240 as `3.2s`, 63000 as `1m 3s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

/** The runs after one more: it is the last, and the last of its scope. */
export function addRun(runs: TestRuns | null, run: TestRun): TestRuns {
  return { ...(runs ?? {}), last: run, [run.scope]: run } as TestRuns
}

/** Words for a per-file run and a full run that gave different results, null when they agree or one is missing. */
export function disagreement(runs: TestRuns | null): string | null {
  if (!runs?.file || !runs.full || runs.file.ok === runs.full.ok) return null
  const word = (r: TestRun) => (r.ok ? 'passed' : 'failed')
  return `per-file run ${word(runs.file)}, full run ${word(runs.full)}`
}
