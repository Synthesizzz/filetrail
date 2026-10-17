// Reading a Bash command for the git actions it runs (commit, push, pull, ...),
// shown in a bar at the bottom of the Files tab: running, then done or failed.
// A guess from the command's words alone, as hooks/bash.ts is. No engine calls here.
// The verbs, their words and their tones follow the filetree mod (MIT); see NOTICE.

import type { GitActionKind } from '../types'
import { splitCommands, tokenize } from './bash'

/** How many finished actions the bar keeps, newest last. */
export const MAX_ACTIONS = 3

type Verb = { verb: string; running: string; done: string; kind: GitActionKind }

/** The git subcommands the bar shows, with the words for them and their colour. */
const GIT_VERBS: Record<string, Verb> = {
  commit: { verb: 'commit', running: 'committing', done: 'committed', kind: 'save' },
  push: { verb: 'push', running: 'pushing', done: 'pushed', kind: 'sync' },
  pull: { verb: 'pull', running: 'pulling', done: 'pulled', kind: 'fetch' },
  fetch: { verb: 'fetch', running: 'fetching', done: 'fetched', kind: 'fetch' },
  checkout: { verb: 'checkout', running: 'checking out', done: 'checked out', kind: 'branch' },
  switch: { verb: 'switch', running: 'switching', done: 'switched', kind: 'branch' },
  merge: { verb: 'merge', running: 'merging', done: 'merged', kind: 'merge' },
  rebase: { verb: 'rebase', running: 'rebasing', done: 'rebased', kind: 'merge' },
  stash: { verb: 'stash', running: 'stashing', done: 'stashed', kind: 'stash' },
}

/** `gh pr` subcommands: one word each. */
const PR_VERBS: Record<string, Verb> = {
  create: { verb: 'PR create', running: 'opening a PR', done: 'opened a PR', kind: 'merge' },
  merge: { verb: 'PR merge', running: 'merging the PR', done: 'merged the PR', kind: 'merge' },
  checkout: { verb: 'PR checkout', running: 'checking out the PR', done: 'checked out the PR', kind: 'branch' },
}

/** git's own flags that take the next word as their value, before the subcommand. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

export type GitActionCall = Verb & { target: string }

/** What follows a verb, shown after its word: the plain words, flags and their values left out, clipped. */
function targetOf(words: readonly string[]): string {
  const plain: string[] = []
  for (let k = 0; k < words.length; k++) {
    const w = words[k]!
    if (w === '-m' || w === '-F' || w === '--message' || w === '-b' || w === '-c' || w === '-B') {
      // A new branch is the target of checkout -b / switch -c; a message is not shown.
      if ((w === '-b' || w === '-c' || w === '-B') && words[k + 1]) plain.push(words[k + 1]!)
      k++
      continue
    }
    if (w.startsWith('-')) continue
    plain.push(w)
  }
  const text = plain.join(' ')
  return text.length > 40 ? text.slice(0, 39) + '…' : text
}

/** The git actions a command runs, in order; none for anything else or a word built at run time. */
export function gitActionsOf(command: string): GitActionCall[] {
  const out: GitActionCall[] = []
  for (const segment of splitCommands(command)) {
    const words = tokenize(segment)
    if (!words?.length) continue
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words.shift()
    const prog = (words[0] ?? '').replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.exe$/, '')
    if (prog === 'git') {
      let k = 1
      while (k < words.length && words[k]!.startsWith('-')) k += GIT_VALUE_FLAGS.has(words[k]!) ? 2 : 1
      const verb = GIT_VERBS[words[k] ?? '']
      // stash list and stash show only read.
      if (verb && !(words[k] === 'stash' && ['list', 'show'].includes(words[k + 1] ?? ''))) out.push({ ...verb, target: targetOf(words.slice(k + 1)) })
    } else if (prog === 'gh' && words[1] === 'pr') {
      const verb = PR_VERBS[words[2] ?? '']
      // gh's flags take values freely (--title "x"): only a PR number or URL is shown.
      if (verb) out.push({ ...verb, target: words.slice(3).find(w => /^(\d+|https?:\/\/\S+)$/.test(w)) ?? '' })
    }
  }
  return out
}

/** Whether a command makes a repository (git init, git clone): a folder found not to be one is asked again. */
export function makesRepo(command: string): boolean {
  return splitCommands(command).some(segment => {
    const words = tokenize(segment)
    if (!words || (words[0] ?? '').replace(/\.exe$/i, '').split(/[\\/]/).pop()!.toLowerCase() !== 'git') return false
    let k = 1
    while (k < words.length && words[k]!.startsWith('-')) k += GIT_VALUE_FLAGS.has(words[k]!) ? 2 : 1
    return words[k] === 'init' || words[k] === 'clone'
  })
}
