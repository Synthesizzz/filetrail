// The Files tab: the tree under the project root with git status, changed
// line counts and how many times Claude edited each file.

import type { EngineInterface } from 'claude-code'

import type { Entry, FilesView, GitInfo, Tone, Turn } from '../types'
import { dirStatus, fileStatus, lineCounts } from './git'
import { relTo } from './history'
import { NBSP } from './paths'
import { editCounts, hasEditsBelow, lower, visibleRows } from './tree'

type Els = ReturnType<EngineInterface['ui']['resolve']>


/** Rows drawn at most; a longer tree says how many it left out. */
export const MAX_ROWS = 400

export type FilesActions = {
  toggle: (dir: Entry) => void
  select: (file: Entry) => void
  /** Shows a file's steps in the History tab. */
  history: (path: string) => void
}

/** How many steps the history holds for a path, applied or not. */
export function stepCount(turns: readonly Turn[], path: string): number {
  const k = lower(path)
  let n = 0
  for (const t of turns) for (const s of t.steps) if (lower(s.path) === k) n++
  return n
}

export const TONE_COLOR: Record<Tone, 'permission' | 'claude'> = { read: 'permission', write: 'claude' }
export const TONE_WORD: Record<Tone, string> = { read: 'reading', write: 'writing' }

export function statusColor(code: string): 'warning' | 'success' | 'error' | undefined {
  if (code === 'M' || code === 'R') return 'warning'
  if (code === 'A' || code === '?') return 'success'
  if (code === 'D' || code === 'U') return 'error'
  return undefined
}

export function branchText(git: GitInfo | null): string {
  if (!git) return 'not a git repo'
  if (!git.branch) return 'git'
  const b = git.branch
  return `⎇ ${b.head}${b.ahead ? ` ↑${b.ahead}` : ''}${b.behind ? ` ↓${b.behind}` : ''}`
}

export function filesView(
  els: Els, root: string, listing: Readonly<Record<string, Entry[]>>, files: FilesView,
  git: GitInfo | null, turns: readonly Turn[], flash: Readonly<Record<string, Tone>>,
  last: { path: string; tone: Tone } | null, actions: FilesActions,
) {
  const { Box, Text, Button } = els
  const name = root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? root
  const counts = editCounts(turns)
  const rows = visibleRows(root, listing, files.expanded)
  const shown = rows.slice(0, MAX_ROWS)
  const selected = files.selected ? lower(files.selected) : null
  const selectedSteps = files.selected ? stepCount(turns, files.selected) : 0

  return (
    <Box key="files" flexDirection="column">
      {/* One line each: side by side, a long folder name and the branch both wrapped in a narrow dock. */}
      <Box key="files-head" flexDirection="column">
        <Text bold wrap="truncate-end">{name}</Text>
        <Text dimColor={!git} wrap="truncate-end" {...(git ? { color: 'claude' } : {})}>{branchText(git)}</Text>
      </Box>
      {files.selected !== null && (
        <Box key="selected" flexDirection="row" gap={1}>
          <Text dimColor wrap="truncate-start">{relTo(root, files.selected)}</Text>
          {selectedSteps
            ? <Button key="file-history" label={`History (${selectedSteps})`} dimColor onPress={() => actions.history(files.selected!)} />
            : <Text dimColor>· no edits recorded</Text>}
        </Box>
      )}
      {!(lower(root) in listing) && <Text dimColor>Reading the folder…</Text>}
      {lower(root) in listing && rows.length === 0 && <Text dimColor>This folder is empty.</Text>}
      {shown.map(({ entry, depth, isOpen }) => {
        const isDir = entry.kind === 'dir'
        const code = isDir ? dirStatus(git, entry.path) : fileStatus(git, entry.path)
        const tone = flash[lower(entry.path)]
        const color = tone ? TONE_COLOR[tone] : statusColor(code)
        const edits = isDir ? 0 : counts.get(lower(entry.path)) ?? 0
        const lines = isDir ? null : lineCounts(git, entry.path)
        const isSelected = lower(entry.path) === selected
        return (
          <Button key={`row-${lower(entry.path)}`} plain onPress={() => (isDir ? actions.toggle(entry) : actions.select(entry))}>
            {/* The desktop draws no `inverse`: a selected file also gets a marker and bold, which every surface shows.
                The indent is non-breaking spaces in a monospace run: the desktop collapses leading plain spaces,
                and a proportional font would set the arrow and the blank slot at different widths. */}
            <Text mono>{NBSP.repeat(2 * depth) + (isDir ? (isOpen ? '▾' : '▸') : isSelected ? '›' : NBSP) + NBSP}</Text>
            <Text {...(color ? { color } : {})} {...(tone || isSelected ? { bold: true } : {})} {...(isSelected ? { inverse: true, underline: true } : {})}>{entry.name}{isDir ? '/' : ''}</Text>
            {tone ? <Text color={TONE_COLOR[tone]}> · {TONE_WORD[tone]}</Text> : null}
            {!tone && last && last.path === lower(entry.path) ? <Text color={TONE_COLOR[last.tone]} dimColor> ◂</Text> : null}
            {edits ? <Text color="claude"> ●{edits}</Text> : null}
            {isDir && !isOpen && hasEditsBelow(counts, entry.path) ? <Text color="claude" dimColor> ●</Text> : null}
            {lines ? <Text color="success"> +{lines[0]}</Text> : null}
            {lines ? <Text color="error"> -{lines[1]}</Text> : null}
            {code && code !== 'M' ? <Text dimColor> {code}</Text> : null}
          </Button>
        )
      })}
      {rows.length > shown.length && <Text dimColor>… {rows.length - shown.length} more rows (close a folder to see them)</Text>}
    </Box>
  )
}
