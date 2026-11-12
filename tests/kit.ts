// The test kit as filetrail's tests use it: `test` gives every test that takes the
// engine's `$` a longer time limit than the kit's 5000 ms default.
//
// Why: the kit loads the whole mod again for each test that calls `$` (about 0.5 s
// of CPU on its own), and `claude plugin test` runs every test file in its own
// child at once. With the suite's files competing for the CPU, such a test takes
// about 3 s, and on a busy machine it passed 5 s, failing a different few each run.
// A test whose body takes no `$` never loads the mod and keeps the default, so a
// pure function that hangs still fails fast.

import { test as kitTest } from 'claude-code/testing'
import type { TestBody, TestOptions } from 'claude-code/testing'

export { expect, mock } from 'claude-code/testing'

/**
 * The time limit of a test that loads the mod. With a second full suite running beside
 * this one (two sessions testing at once), the slowest such test took 11.8 s, so 15 s
 * left too little room; 30 s is about 2.5 times that.
 */
export const PLUGIN_TEST_TIMEOUT_MS = 30_000

/** `test` from the kit, with `PLUGIN_TEST_TIMEOUT_MS` for a body that takes `$`, unless the test names its own limit. */
export function test(name: string, body: TestBody): void
export function test(name: string, options: TestOptions, body: TestBody): void
export function test(name: string, a: TestBody | TestOptions, b?: TestBody): void {
  const options: TestOptions = typeof a === 'function' ? {} : a
  const body = (typeof a === 'function' ? a : b) as TestBody
  // A body declared with parameters, `($, on) => ...`, uses the engine and so loads the mod.
  const loadsMod = body.length > 0
  kitTest(name, loadsMod ? { timeoutMs: PLUGIN_TEST_TIMEOUT_MS, ...options } : options, body)
}
