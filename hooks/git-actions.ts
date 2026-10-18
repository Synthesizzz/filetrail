// Reading a Bash command for the git actions it runs (commit, push, pull, ...),
// shown in a bar at the bottom of the Files tab: running, then done or failed.
// A guess from the command's words alone, as hooks/bash.ts is. No engine calls here.
// The verbs, their words and their tones follow the filetree mod (MIT); see NOTICE.

import type { GitActionKind, GitIcon, GitPose } from '../types'
import { splitCommands, tokenize, toPath } from './bash'
import { normPath } from './history'

/** How many finished actions the bar keeps, newest last. */
export const MAX_ACTIONS = 3

type Verb = { verb: string; running: string; done: string; kind: GitActionKind; icon: GitIcon; pose?: GitPose }

/** The git subcommands the bar shows, with the words for them, their colour, their icon and the crab's pose. */
const GIT_VERBS: Record<string, Verb> = {
  commit: { verb: 'commit', running: 'committing', done: 'committed', kind: 'save', icon: 'commit' },
  push: { verb: 'push', running: 'pushing', done: 'pushed', kind: 'sync', icon: 'push', pose: 'push' },
  pull: { verb: 'pull', running: 'pulling', done: 'pulled', kind: 'fetch', icon: 'pull' },
  fetch: { verb: 'fetch', running: 'fetching', done: 'fetched', kind: 'fetch', icon: 'pull' },
  checkout: { verb: 'checkout', running: 'checking out', done: 'checked out', kind: 'branch', icon: 'branch' },
  switch: { verb: 'switch', running: 'switching', done: 'switched', kind: 'branch', icon: 'branch' },
  merge: { verb: 'merge', running: 'merging', done: 'merged', kind: 'merge', icon: 'merge', pose: 'merge' },
  rebase: { verb: 'rebase', running: 'rebasing', done: 'rebased', kind: 'merge', icon: 'merge', pose: 'merge' },
  stash: { verb: 'stash', running: 'stashing', done: 'stashed', kind: 'stash', icon: 'stash' },
}

/** `gh pr` subcommands: one word each. */
const PR_VERBS: Record<string, Verb> = {
  create: { verb: 'PR create', running: 'opening a PR', done: 'opened a PR', kind: 'merge', icon: 'pr' },
  merge: { verb: 'PR merge', running: 'merging the PR', done: 'merged the PR', kind: 'merge', icon: 'merge', pose: 'merge' },
  checkout: { verb: 'PR checkout', running: 'checking out the PR', done: 'checked out the PR', kind: 'branch', icon: 'pr' },
}

/** git's own flags that take the next word as their value, before the subcommand. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

export type GitActionCall = Verb & { target: string; repo: string }

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

const trimSlash = (p: string) => p.replace(/\/+$/, '').toLowerCase()

/** A path with its `.` and `..` steps worked out (`C:/a/b/../c/.` is `C:/a/c`). */
function collapse(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..' && out.length > 1) out.pop()
    else out.push(part)
  }
  return out.join('/') || '/'
}

/** The folder name to show for an action run in `dir`; '' when that is the project root (or unknown). */
export function repoLabel(root: string, dir: string | null): string {
  if (!dir) return ''
  const at = collapse(dir)
  if (trimSlash(at) === trimSlash(collapse(normPath(root)))) return ''
  return at.split('/').pop() ?? ''
}

/**
 * The git actions a command runs, in order; none for anything else or a word built at
 * run time. `repo` names the folder an action ran in when a `cd` before it, or git's
 * own `-C`, moved it away from `root`, so the bar does not pass another repo's
 * commit off as this project's.
 */
export function gitActionsOf(command: string, root = ''): GitActionCall[] {
  const out: GitActionCall[] = []
  // Where the commands run: the root until a cd moves it; null once a cd went somewhere unreadable.
  let dir: string | null = root ? normPath(root) : null
  for (const segment of splitCommands(command)) {
    const words = tokenize(segment)
    if (!words?.length) continue
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words.shift()
    const prog = (words[0] ?? '').replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.exe$/, '')
    if (prog === 'cd' || prog === 'pushd' || prog === 'set-location') {
      const to = words.slice(1).find(w => !w.startsWith('-'))
      dir = to && dir !== null ? toPath(dir, to) : null
      continue
    }
    if (prog === 'git') {
      let k = 1
      let here = dir
      while (k < words.length && words[k]!.startsWith('-')) {
        if (words[k] === '-C' && words[k + 1]) here = here !== null ? toPath(here, words[k + 1]!) : null
        k += GIT_VALUE_FLAGS.has(words[k]!) ? 2 : 1
      }
      const verb = GIT_VERBS[words[k] ?? '']
      // stash list and stash show only read.
      if (verb && !(words[k] === 'stash' && ['list', 'show'].includes(words[k + 1] ?? ''))) {
        out.push({ ...verb, target: targetOf(words.slice(k + 1)), repo: root ? repoLabel(root, here) : '' })
      }
    } else if (prog === 'gh' && words[1] === 'pr') {
      const verb = PR_VERBS[words[2] ?? '']
      // gh's flags take values freely (--title "x"): only a PR number or URL is shown.
      if (verb) out.push({ ...verb, target: words.slice(3).find(w => /^(\d+|https?:\/\/\S+)$/.test(w)) ?? '', repo: root ? repoLabel(root, dir) : '' })
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
