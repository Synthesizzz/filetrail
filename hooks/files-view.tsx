// The Files tab: the tree under the project root with git status, changed
// line counts and how many times Claude edited each file.

import type { EngineInterface } from 'claude-code'

import type { Entry, FilesView, GitActionEntry, GitActionKind, GitInfo, SearchIndex, Tone, Turn } from '../types'
import { dirCounts, dirStatus, fileStatus, lineCounts } from './git'
import { relTo } from './history'
import { NARROW_COLUMNS, NBSP, splitPath } from './paths'
import type { RowProps, Seg } from './row'
import { rowPresses } from './presses'
import { findFiles } from './search'
import { editCounts, hasEditsBelow, lower, visibleRows } from './tree'

type Els = ReturnType<EngineInterface['ui']['resolve']>
/** Rows drawn at most; a longer tree says how many it left out. */
export const MAX_ROWS = 400

export type FilesActions = {
  toggle: (dir: Entry) => void
  select: (file: Entry) => void
  /** Shows a file's steps in the History tab. */
  history: (path: string) => void
  /** Clears the selection, which also stops it riding along with prompts. */
  unselect: () => void
  /** Sets the search box's text; '' goes back to the tree. */
  search: (query: string) => void
  /** Leaves the search for the tree, opened to this file (relative to the root) and selected. */
  openHit: (rel: string) => void
  /** Opens a file with the machine's default app. */
  open: (path: string) => void
  /** Puts a path on the clipboard of the surface pressed: from the root, or whole. */
  copy: (path: string, full: boolean, surface: string) => void
}

/** The search results in place of the tree: file name first, folder dimmed, the best matches on top. */
function searchResults(els: Els, query: string, index: SearchIndex | null, actions: FilesActions) {
  const { Box, Text, Button } = els
  if (!index) return <Text key="search-wait" dimColor>Listing the project's files…</Text>
  const { hits, total } = findFiles(index.files, query)
  return (
    <Box key="search-results" flexDirection="column">
      <Text dimColor>
        {total === 0 ? 'No files match.' : total > hits.length ? `${total} matches, the first ${hits.length} shown` : `${total} match${total === 1 ? '' : 'es'}`}
        {index.complete ? '' : ' (the file list was cut short)'}
      </Text>
      {hits.map(rel => {
        const { name, dir } = splitPath(rel)
        return (
          <Button key={`hit-${rel.toLowerCase()}`} plain onPress={() => actions.openHit(rel)}>
            <Text bold>{name}</Text>{dir ? <Text dimColor> {dir}</Text> : null}
          </Button>
        )
      })}
    </Box>
  )
}

/** How many steps the history holds for a path, applied or not. */
export function stepCount(turns: readonly Turn[], path: string): number {
  const k = lower(path)
  let n = 0
  for (const t of turns) for (const s of t.steps) if (lower(s.path) === k) n++
  return n
}

/**
 * Reads are a raw violet: the desktop paints no colour for the `permission` theme key
 * (seen live: "· reading" drawn in plain text), while it does for `claude`, `success`,
 * `error` and `warning`, which are taken (writes, commits, git status). The violet is
 * mid-dark enough to read on light and dark backgrounds alike.
 */
export const READ_COLOR = '#8b5cf6'
export const TONE_COLOR: Record<Tone, string> = { read: READ_COLOR, write: 'claude', commit: 'success' }
export const TONE_WORD: Record<Tone, string> = { read: 'reading', write: 'writing', commit: 'committed' }
/**
 * The shimmer's palette per tone, base to brightest: a bright band sweeps across a lit
 * name and its word, as if being typed (the band and these steps follow filetree, MIT).
 * Writes use an orange near the `claude` key, which a palette cannot shade.
 */
export const TONE_SHIMMER: Record<Tone, string[]> = {
  read: [READ_COLOR, '#a78bfa', '#c4b5fd', '#ede9fe'],
  write: ['#d97757', '#e8956f', '#f2b394', '#fde1d3'],
  commit: ['#22c55e', '#4ade80', '#86efac', '#dcfce7'],
}

/** The git bar's palette per kind of action, base to brightest (filetree's tones, MIT). */
export const KIND_SHIMMER: Record<GitActionKind, string[]> = {
  save: ['#22c55e', '#4ade80', '#86efac', '#dcfce7'],
  sync: ['#14b8a6', '#2dd4bf', '#5eead4', '#ccfbf1'],
  fetch: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  branch: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  merge: ['#a855f7', '#c084fc', '#d8b4fe', '#f3e8ff'],
  stash: ['#f97316', '#fb923c', '#fdba74', '#ffedd5'],
}

/** One git action as coloured runs: running shimmers in its kind's colour, done has a ✓, a failure a red ✗. */
export function gitActionSegs(a: GitActionEntry): Seg[] {
  const palette = KIND_SHIMMER[a.kind]
  const target: Seg[] = [
    ...(a.target ? [{ t: `${NBSP}${a.target}`, dim: true }] : []),
    // Another repo's action says whose it is, so it is not read as this project's.
    ...(a.repo ? [{ t: `${NBSP}·${NBSP}${a.repo}`, dim: true }] : []),
  ]
  if (a.state === 'running') return [{ t: `…${NBSP}`, c: palette[0] }, { t: a.running, c: palette[0], b: true, sh: palette }, ...target]
  if (a.state === 'ok') return [{ t: `✓${NBSP}`, c: palette[0] }, { t: a.done, c: palette[0] }, ...target]
  if (a.state === 'denied') return [{ t: `⊘${NBSP}`, dim: true }, { t: `${a.verb} denied`, dim: true }, ...target]
  return [{ t: `✗${NBSP}`, c: 'error' }, { t: `${a.verb} failed`, c: 'error' }, ...target]
}

/** The git bar: the last few git actions Claude ran, under the tree. */
function gitBar(els: Els, log: readonly GitActionEntry[]) {
  const { Box, Text } = els
  const Client = 'Client' in els ? els.Client : undefined
  if (!log.length) return null
  return (
    <Box key="git-bar" flexDirection="column" marginTop={1}>
      {log.map(a => {
        const segs = gitActionSegs(a)
        // A Client for the shimmer while it runs; nothing to press (no entry in rowPresses).
        return Client
          ? <Client key={`git-${a.id}`} module="./row.tsx" width="100%" props={{ segs, hoverAt: -1 } satisfies RowProps} />
          : <Text key={`git-${a.id}`}>{segs.map(s => <Text {...(s.c ? { color: s.c } : {})} {...(s.b ? { bold: true } : {})} {...(s.dim ? { dimColor: true } : {})}>{s.t}</Text>)}</Text>
      })}
    </Box>
  )
}

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
  // A word, not the ⎇ glyph: the desktop's font drew it as an unreadable mark (seen live).
  return `branch ${b.head}${b.ahead ? ` ↑${b.ahead}` : ''}${b.behind ? ` ↓${b.behind}` : ''}`
}

export function filesView(
  els: Els, root: string, listing: Readonly<Record<string, Entry[]>>, files: FilesView,
  git: GitInfo | null, turns: readonly Turn[], flash: Readonly<Record<string, Tone>>,
  last: { path: string; tone: Tone } | null, actions: FilesActions, width = 60,
  searchIndex: SearchIndex | null = null, gitLog: readonly GitActionEntry[] = [],
) {
  const query = files.query ?? ''
  const searching = query.trim() !== ''
  const { Box, Text, Button } = els
  // Only surfaces that take typing have an Input (terminal, desktop); elsewhere the search box is left out.
  const Input = 'Input' in els ? els.Input : undefined
  const Client = 'Client' in els ? els.Client : undefined
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
      {/* Under the branch, not under the tree: the pane scrolls as one, so a footer below a long tree is out of sight. */}
      {gitBar(els, gitLog)}
      {Input && (
        <Box key="search-row" flexDirection="row" gap={1} marginTop={1}>
          <Box key="search-box" flexGrow={1} flexDirection="column">
            <Input key="search" placeholder="Search files" value={query} onInput={(v: string) => actions.search(v)} onSubmit={(v: string) => actions.search(v)} />
          </Box>
          {searching && <Button key="search-clear" label="✕" plain dimColor onPress={() => actions.search('')} />}
        </Box>
      )}
      {/* The selected file rides along with every prompt until ✕: say so plainly, since it changes what Claude reads. */}
      {files.selected !== null && (
        <Box key="selected" flexDirection="column" marginTop={1}>
          <Box key="selected-name" flexDirection="row" flexWrap="wrap" gap={1}>
            <Text color="claude">Claude sees:</Text>
            {width < NARROW_COLUMNS
              ? <Text bold>{splitPath(relTo(root, files.selected)).name}</Text>
              : <Text bold wrap="wrap">{relTo(root, files.selected)}</Text>}
            {/* No hotkey: the desktop draws its chip beside the label, which read as "X ✕" (seen live). */}
            <Button key="unselect" label="✕" plain dimColor onPress={() => actions.unselect()} />
          </Box>
          <Box key="selected-actions" flexDirection="row" flexWrap="wrap" gap={1}>
            {width < NARROW_COLUMNS && splitPath(relTo(root, files.selected)).dir
              ? <Text dimColor>{splitPath(relTo(root, files.selected)).dir}</Text>
              : null}
            {selectedSteps
              ? <Button key="file-history" label={`History (${selectedSteps})`} dimColor onPress={() => actions.history(files.selected!)} />
              : <Text dimColor>· no edits recorded</Text>}
          </Box>
          <Box key="selected-tools" flexDirection="row" flexWrap="wrap" gap={1}>
            <Button key="open-file" label="Open" dimColor onPress={() => actions.open(files.selected!)} />
            <Button key="copy-path" label="Copy path" dimColor onPress={press => actions.copy(files.selected!, false, press.surface)} />
            <Button key="copy-full" label="Copy full path" dimColor onPress={press => actions.copy(files.selected!, true, press.surface)} />
          </Box>
        </Box>
      )}
      {searching ? searchResults(els, query, searchIndex, actions) : (
      <Box key="tree" flexDirection="column">
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
        const key = `row-${lower(entry.path)}`
        const press = () => (isDir ? actions.toggle(entry) : actions.select(entry))
        // The desktop draws no `inverse`: a selected file also gets a marker and bold, which every surface shows.
        // The indent is non-breaking spaces in a monospace run: the desktop collapses leading plain spaces,
        // and a proportional font would set the arrow and the blank slot at different widths.
        const segs: Seg[] = [
          { t: NBSP.repeat(2 * depth) + (isDir ? (isOpen ? '▾' : '▸') : isSelected ? '›' : NBSP) + NBSP, mono: true },
          { t: entry.name + (isDir ? '/' : ''), ...(color ? { c: color } : {}), ...(tone || isSelected ? { b: true } : {}), ...(isSelected ? { u: true } : {}), ...(tone ? { sh: TONE_SHIMMER[tone] } : {}) },
        ]
        if (tone) segs.push({ t: `${NBSP}· ${TONE_WORD[tone]}`, c: TONE_COLOR[tone], b: true, sh: TONE_SHIMMER[tone] })
        else if (last && last.path === lower(entry.path)) segs.push({ t: `${NBSP}◂`, c: TONE_COLOR[last.tone] })
        if (edits) segs.push({ t: `${NBSP}●${edits}`, c: 'claude' })
        if (isDir && !isOpen && hasEditsBelow(counts, entry.path)) segs.push({ t: `${NBSP}●`, c: 'claude', dim: true })
        if (lines) segs.push({ t: `${NBSP}+${lines[0]}`, c: 'success' }, { t: `${NBSP}-${lines[1]}`, c: 'error' })
        // A folder says how many changes it holds, by kind; a file (or an untracked folder) its letter.
        const below = isDir ? dirCounts(git, entry.path) : null
        if (below) {
          if (below.changed) segs.push({ t: `${NBSP}M:${below.changed}`, c: 'warning' })
          if (below.added) segs.push({ t: `${NBSP}?:${below.added}`, c: 'success' })
          if (below.deleted) segs.push({ t: `${NBSP}D:${below.deleted}`, c: 'error' })
        } else if (code && code !== 'M') segs.push({ t: `${NBSP}${code}`, dim: true })
        if (Client) {
          rowPresses.set(key, press)
          // As wide as the pane, so the row knows its room and fits itself (it never wraps).
          return <Client key={key} module="./row.tsx" width="100%" props={{ segs } satisfies RowProps} />
        }
        // Surfaces without a Client: a plain Button, which may not paint the colours.
        return (
          <Button key={key} plain onPress={press}>
            {segs.map(s => <Text {...(s.c ? { color: s.c } : {})} {...(s.b ? { bold: true } : {})} {...(s.u ? { underline: true } : {})} {...(s.dim ? { dimColor: true } : {})} {...(s.mono ? { mono: true } : {})}>{s.t}</Text>)}
          </Button>
        )
      })}
      {rows.length > shown.length && <Text dimColor>… {rows.length - shown.length} more rows (close a folder to see them)</Text>}
      </Box>
      )}
    </Box>
  )
}
