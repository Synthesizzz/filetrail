import { expect, test } from 'claude-code/testing'

import type { GitActionEntry } from '../types'
import { gitActionSegs, KIND_SHIMMER } from '../hooks/files-view'
import { gitActionsOf, makesRepo, MAX_ACTIONS } from '../hooks/git-actions'
import { PANE, START, rowText, world } from './world'

const verbs = (command: string) => gitActionsOf(command).map(a => `${a.verb}|${a.target}`)

test('gitActionsOf finds git and gh pr actions, with what they name', () => {
  expect(verbs('git push origin main')).toEqual(['push|origin main'])
  expect(verbs('git commit -m "fix: x" && git push')).toEqual(['commit|', 'push|'])
  expect(verbs('git -C ../repo pull --rebase')).toEqual(['pull|'])
  expect(verbs('git checkout -b feat/bar')).toEqual(['checkout|feat/bar'])
  expect(verbs('git switch -c topic origin/main')).toEqual(['switch|topic origin/main'])
  expect(verbs('gh pr create --title "x" --fill')).toEqual(['PR create|'])
  expect(verbs('cd repo; git stash pop')).toEqual(['stash|pop'])
})

test('gitActionsOf names the folder an action ran in when a cd or -C moved it off the root', () => {
  const repos = (command: string) => gitActionsOf(command, 'C:/work/demo').map(a => `${a.verb}|${a.repo}`)
  expect(repos('git commit -m x')).toEqual(['commit|'])
  expect(repos('git -C C:/Users/me/claude-mods/filetrail commit -F -')).toEqual(['commit|filetrail'])
  expect(repos('git -C /c/work/demo push')).toEqual(['push|'])
  expect(repos('git -C . push')).toEqual(['push|'])
  expect(repos('cd ../other && git pull')).toEqual(['pull|other'])
  expect(repos('cd sub; git stash; cd ..')).toEqual(['stash|sub'])
  // No root given (or a cd built at run time): nothing to compare with, so no name.
  expect(gitActionsOf('git -C ../x push').map(a => a.repo)).toEqual([''])
  expect(repos('cd $DIR && git push')).toEqual(['push|'])
})

test('gitActionsOf ignores reads, other programs and words built at run time', () => {
  expect(verbs('git status && git log --oneline -5 && git diff')).toEqual([])
  expect(verbs('echo git push')).toEqual([])
  expect(verbs('git push origin $BRANCH')).toEqual([])
  expect(verbs('gh issue list')).toEqual([])
  expect(verbs('git stash list && git stash show -p')).toEqual([])
})

test('makesRepo: git init and git clone make one, other git commands do not', () => {
  expect(makesRepo('git init')).toBe(true)
  expect(makesRepo('cd x && git -C sub init -q')).toBe(true)
  expect(makesRepo('C:\\Git\\bin\\git.exe clone https://example.com/r.git')).toBe(true)
  expect(makesRepo('git status')).toBe(false)
  expect(makesRepo('echo git init')).toBe(false)
})

test('a git init through Bash makes a folder found not to be a repo be asked again', async ($, on) => {
  const { clock, ran } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  expect(ran.filter(a => a[1] === 'rev-parse').length).toBe(1)
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await clock.advance(1000)
  expect(ran.filter(a => a[1] === 'rev-parse').length).toBe(1)
  await $.tool.call({ tool: 'Bash', command: 'git init' })
  await clock.advance(1000)
  expect(ran.filter(a => a[1] === 'rev-parse').length).toBe(2)
})

test('gitActionSegs: running shimmers in its colour, done ticks, failure is red, denial dim', () => {
  const base: GitActionEntry = { id: 'g1', verb: 'push', running: 'pushing', done: 'pushed', kind: 'sync', target: 'origin main', repo: '', state: 'running', at: 1 }
  const text = (a: GitActionEntry) => gitActionSegs(a).map(s => s.t.replace(/\u00a0/g, ' ')).join('')
  expect(text(base)).toBe('… pushing origin main')
  expect(gitActionSegs(base)[1]!.sh).toEqual(KIND_SHIMMER.sync)
  expect(text({ ...base, state: 'ok' })).toBe('✓ pushed origin main')
  expect(gitActionSegs({ ...base, state: 'ok' })[1]!.sh).toBeUndefined()
  expect(text({ ...base, state: 'failed' })).toBe('✗ push failed origin main')
  expect(gitActionSegs({ ...base, state: 'failed' })[1]!.c).toBe('error')
  expect(text({ ...base, state: 'denied', target: '' })).toBe('⊘ push denied')
  expect(text({ ...base, state: 'ok', target: '', repo: 'filetrail' })).toBe('✓ pushed · filetrail')
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = { 'C:\\work\\demo': [['README.md', 'file']] }

/** The bar's rows, oldest first, as their text. */
async function bar(ui: any): Promise<string[]> {
  const keys = (await ui.findAll({ type: 'Client' })).map((c: any) => c.key).filter((k: string) => k?.startsWith('git-'))
  return Promise.all(keys.map((k: string) => rowText(ui, k)))
}

test('the git bar shows each action as it came out, the last three kept, until newer ones push them out', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS })
  await $.session.start(START)
  await clock.advance(1000)
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  expect(await bar(ui)).toEqual([])

  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(await bar(ui)).toEqual([])

  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(await bar(ui)).toEqual(['✓ pushed origin main'])

  expect(await ui.find({ key: 'git-more' })).toBeUndefined()

  // At rest the bar is one line: the latest action, and how many more are kept.
  await $.tool.call({ tool: 'Bash', command: 'git pull --fail' })
  expect(await bar(ui)).toEqual(['✗ pull failed'])
  expect((await ui.find({ key: 'git-more' }))?.props?.label).toBe('1 more')

  await $.tool.call({ tool: 'Bash', command: 'git checkout -b topic && git stash' })
  expect(await bar(ui)).toEqual(['✓ stashed'])
  expect((await ui.find({ key: 'git-more' }))?.props?.label).toBe('2 more')

  // "2 more" shows all kept, oldest first; "fewer" folds them again.
  await ui.press({ key: 'git-more' })
  const rows = await bar(ui)
  expect(rows.length).toBe(MAX_ACTIONS)
  expect(rows).toEqual(['✗ pull failed', '✓ checked out topic', '✓ stashed'])
  expect((await ui.find({ key: 'git-more' }))?.props?.label).toBe('fewer')
  await ui.press({ key: 'git-more' })
  expect(await bar(ui)).toEqual(['✓ stashed'])
  await clock.advance(1000)
  await ui.unmount()
})
