// The Files tab: the tree under the project root with git status, changed
// line counts and how many times Claude edited each file.

import type { EngineInterface } from 'claude-code'

import type { Entry, FilesView, GitActionEntry, GitActionKind, GitInfo, SearchIndex, Tone, Turn } from '../types'
import { dirCounts, dirStatus, fileStatus, lineCounts, linesBelow, repoSummary } from './git'
import type { DirCounts } from './git'
import { relTo } from './history'
import { NARROW_COLUMNS, NBSP, NNBSP, splitPath, stampOf } from './paths'
import type { RowProps, Seg } from './row'
import { rowCopies, rowOpens, rowPresses, toolPresses } from './presses'
import type { Tool, ToolsProps } from './tools'
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
  /** Shows every kept git action in the bar, or only the latest again. */
  toggleGitLog: () => void
  /** Lists the open folders again, reads git again and rebuilds the search's file list. */
  refresh: () => void
  /** Leaves dotfiles out of the tree, or shows them again. */
  toggleDots: () => void
  /** Closes every folder. */
  collapseAll: () => void
  /** Opens the tree down to the selected file and scrolls to it. */
  goToSelected: () => void
}

/** The search results in place of the tree: file name first, folder dimmed, the best matches on top. */
function searchResults(els: Els, query: string, index: SearchIndex | null, actions: FilesActions) {
  const { Box, Text, Button } = els
  if (!index) return <Text key="search-wait" dimColor>Listing the project's files…</Text>
  const { hits, total } = findFiles(index.files, query)
  return (
    <Box key="search-results" flexDirection="column" gap="xs">
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

/**
 * The git bar: the latest git action Claude ran, with "N more" to show the others
 * kept (oldest first) and "fewer" to fold them again, so it takes one line at rest.
 */
function gitBar(els: Els, log: readonly GitActionEntry[], open: boolean, actions: FilesActions) {
  const { Box, Text, Button } = els
  const Client = 'Client' in els ? els.Client : undefined
  if (!log.length) return null
  const shownLog = open ? log : log.slice(-1)
  const more = log.length - 1
  const line = (a: GitActionEntry) => {
    const segs = gitActionSegs(a)
    // A Client for the shimmer while it runs; nothing to press (no entry in rowPresses).
    return Client
      ? <Client key={`git-${a.id}`} module="./row.tsx" flexGrow={1} props={{ segs, hoverAt: -1 } satisfies RowProps} />
      : <Text key={`git-${a.id}`}>{segs.map(s => <Text {...(s.c ? { color: s.c } : {})} {...(s.b ? { bold: true } : {})} {...(s.dim ? { dimColor: true } : {})}>{s.t}</Text>)}</Text>
  }
  const toggle = more > 0
    ? <Button key="git-more" label={open ? 'fewer' : `${more} more`} plain dimColor onPress={() => actions.toggleGitLog()} />
    : null
  return (
    <Box key="git-bar" flexDirection="column">
      {shownLog.map((a, k) => (
        <Box key={`git-line-${a.id}`} flexDirection="row" gap={1}>
          {line(a)}
          {k === shownLog.length - 1 ? toggle : null}
        </Box>
      ))}
    </Box>
  )
}

/** A status as VS Code's explorer letters it: U for untracked, C for a conflict, the code itself otherwise. */
export function gitLetter(code: string): string {
  if (code === '?') return 'U'
  if (code === 'U') return 'C'
  return code
}

/** The folder colour, filetree's accent: a blue that reads on light and dark backgrounds. */
export const FOLDER_COLOR = '#5b9bd5'
/** The selected row's fill: filetree's selection grey, at a third so the text stays legible in either theme. */
export const SELECTED_BG = '#6b728055'

/** A folder's counts by kind, at the right edge: new, changed, deleted, as filetree orders them. */
function countSegs(n: DirCounts): Seg[] {
  const out: Seg[] = []
  if (n.added) out.push({ t: `${NNBSP}?:${n.added}`, c: GIT_HEX.added, right: true })
  if (n.changed) out.push({ t: `${NNBSP}M:${n.changed}`, c: GIT_HEX.changed, right: true })
  if (n.deleted) out.push({ t: `${NNBSP}D:${n.deleted}`, c: GIT_HEX.deleted, right: true })
  return out
}

/** The whole repo's changes, for the branch line; "clean" when there are none. */
function repoTotals(els: Els, git: GitInfo | null) {
  const { Text } = els
  const sum = repoSummary(git)
  if (!sum) return null
  const runs = [...(sum.lines?.[0] ? [{ t: `+${sum.lines[0]}`, c: GIT_HEX.add }] : []), ...(sum.lines?.[1] ? [{ t: `-${sum.lines[1]}`, c: GIT_HEX.del }] : []), ...countSegs(sum.counts).map(s => ({ t: s.t.replace(NNBSP, ''), c: s.c! }))]
  if (!runs.length) return <Text key="repo-totals" dimColor>clean</Text>
  return <Text key="repo-totals">{runs.map((r, k) => <Text color={r.c}>{(k ? ' ' : '') + r.t}</Text>)}</Text>
}

/**
 * filetree's softer git palette, easier on the eye than the theme's own success, warning
 * and error, in a tree where many names carry one: yellow changed, green new, blue renamed,
 * red deleted or conflicted, and its greens and reds for lines added and removed.
 */
export const GIT_HEX = {
  changed: '#e5c07b', added: '#98c379', renamed: '#61afef', deleted: '#d0605e',
  add: '#98c379', del: '#e06c75', muted: '#808a96',
} as const

export function statusColor(code: string): string | undefined {
  if (code === 'M') return GIT_HEX.changed
  if (code === 'R') return GIT_HEX.renamed
  if (code === 'A' || code === '?') return GIT_HEX.added
  if (code === 'D' || code === 'U') return GIT_HEX.deleted
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
  const rows = visibleRows(root, listing, files.expanded, files.hideDots === true)
  const shown = rows.slice(0, MAX_ROWS)
  const selected = files.selected ? lower(files.selected) : null
  const selectedSteps = files.selected ? stepCount(turns, files.selected) : 0
  const tools: (Tool & { run: () => void })[] = [
    { id: 'refresh', glyph: '↻', hint: 'Refresh folders and git', run: () => actions.refresh() },
    files.hideDots
      ? { id: 'dots', glyph: '○', hint: 'Show dotfiles', run: () => actions.toggleDots() }
      : { id: 'dots', glyph: '◉', hint: 'Hide dotfiles', run: () => actions.toggleDots() },
    { id: 'collapse', glyph: '⊟', hint: 'Close all folders', run: () => actions.collapseAll() },
    ...(files.selected !== null ? [{ id: 'go-selected', glyph: '⌖', hint: 'Go to the selected file', run: () => actions.goToSelected() }] : []),
  ]
  for (const t of tools) toolPresses.set(t.id, t.run)

  return (
    // Step-named gaps: the desktop sizes them on its own scale (seen live: rows and sections ran together),
    // the terminal draws `xs` down as no line and `md` as one, as before.
    <Box key="files" flexDirection="column" gap="md">
      {/* As filetree heads its tree: the folder, then the branch and its upstream with the repo's changes at the right. */}
      <Box key="files-head" flexDirection="column" gap="xs">
        <Box key="name-line" flexDirection="row" gap={1}>
          <Text bold color={FOLDER_COLOR} wrap="truncate-end">{name}</Text>
          {/* filetree's header buttons, its plain Unicode glyphs. A Client draws them where it can, so
              hovering one says what it does (a desktop Button has no tooltip); Buttons elsewhere. */}
          {Client
            ? <Client key="tree-tools" module="./tools.tsx" flexGrow={1} props={{ tools: tools.map(({ id, glyph, hint }) => ({ id, glyph, hint })) } satisfies ToolsProps} />
            : (
              <Box key="tree-tools" flexDirection="row" gap={1} flexGrow={1} justifyContent="flex-end">
                {tools.map(t => <Button key={t.id} label={t.glyph} plain dimColor onPress={t.run} />)}
              </Box>
            )}
        </Box>
        <Box key="branch-line" flexDirection="row" gap={1}>
          <Text dimColor={!git} wrap="truncate-end" {...(git?.branch ? { color: 'claude', bold: true } : {})}>{branchText(git)}</Text>
          {git?.branch?.upstream ? <Text dimColor wrap="truncate-end">{git.branch.upstream}</Text> : null}
          <Box flexGrow={1} />
          {repoTotals(els, git)}
        </Box>
      </Box>
      {/* Under the branch, not under the tree: the pane scrolls as one, so a footer below a long tree is out of sight. */}
      {gitBar(els, gitLog, files.gitOpen === true, actions)}
      {Input && (
        <Box key="search-row" flexDirection="row" gap={1}>
          <Box key="search-box" flexGrow={1} flexDirection="column">
            <Input key="search" placeholder="Search files" value={query} onInput={(v: string) => actions.search(v)} onSubmit={(v: string) => actions.search(v)} />
          </Box>
          {searching && <Button key="search-clear" label="✕" plain dimColor onPress={() => actions.search('')} />}
        </Box>
      )}
      {/* The selected file rides along with every prompt until ✕: say so plainly, since it changes what Claude reads. */}
      {files.selected !== null && (
        <Box key="selected" flexDirection="column" gap="xs">
          <Box key="selected-name" flexDirection="row" flexWrap="wrap" gap={1}>
            <Text color="claude">Claude sees:</Text>
            {width < NARROW_COLUMNS
              ? <Text bold>{splitPath(relTo(root, files.selected)).name}</Text>
              : <Text bold wrap="wrap">{relTo(root, files.selected)}</Text>}
            {width < NARROW_COLUMNS && splitPath(relTo(root, files.selected)).dir
              ? <Text dimColor>{splitPath(relTo(root, files.selected)).dir}</Text>
              : null}
            {/* No hotkey: the desktop draws its chip beside the label, which read as "X ✕" (seen live). */}
            <Button key="unselect" label="✕" plain dimColor onPress={() => actions.unselect()} />
          </Box>
          {/* Every action on one row, wrapping only when the dock is too narrow. */}
          <Box key="selected-tools" flexDirection="row" flexWrap="wrap" gap={1}>
            {selectedSteps
              ? <Button key="file-history" label={`History (${selectedSteps})`} dimColor onPress={() => actions.history(files.selected!)} />
              : null}
            <Button key="open-file" label="Open" dimColor onPress={() => actions.open(files.selected!)} />
            <Button key="copy-path" label="Copy path" dimColor onPress={press => actions.copy(files.selected!, false, press.surface)} />
            <Button key="copy-full" label="Full path" dimColor onPress={press => actions.copy(files.selected!, true, press.surface)} />
            {selectedSteps ? null : <Text dimColor>no edits recorded</Text>}
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
        // As filetree draws on the desktop (its Nerd Font icons have no glyph there): a blue
        // ■ for a folder, a · for a file; a dotfile's name is dimmed unless git or Claude colours it.
        const dotfile = entry.name.startsWith('.')
        const segs: Seg[] = [
          // The selected row is filled where a Client draws it; a marker stands in elsewhere.
          { t: NBSP.repeat(2 * depth) + (isDir ? (isOpen ? '▾' : '▸') : isSelected && !Client ? '›' : NBSP) + NNBSP, mono: true },
          { t: (isDir ? '■' : '·') + NNBSP, ...(isDir ? { c: FOLDER_COLOR } : {}), dim: !isDir || dotfile },
          {
            t: entry.name + (isDir ? '/' : ''), name: true,
            ...(color ? { c: color } : dotfile ? { dim: true } : {}),
            ...(tone || isSelected ? { b: true } : {}), ...(tone ? { sh: TONE_SHIMMER[tone] } : {}),
          },
        ]
        if (tone) segs.push({ t: `${NNBSP}· ${TONE_WORD[tone]}`, c: TONE_COLOR[tone], b: true, sh: TONE_SHIMMER[tone] })
        else if (last && last.path === lower(entry.path)) segs.push({ t: `${NNBSP}◂`, c: TONE_COLOR[last.tone] })
        // At the right edge, as VS Code's explorer does: Claude's edits, the lines changed, then
        // one git letter for a file (or a folder untracked as a whole) and a dot for a folder
        // with changes inside.
        if (edits) segs.push({ t: `${NNBSP}●${edits}`, c: 'claude', right: true })
        if (isDir && !isOpen && hasEditsBelow(counts, entry.path)) segs.push({ t: `${NNBSP}●`, c: 'claude', dim: true, right: true })
        // Lines changed (a folder sums its files'), then a file's git letter or a folder's
        // counts by kind, as filetree shows them; a clean file shows when it last changed.
        const sum = isDir ? linesBelow(git, entry.path) : lines
        // Only what is there, as filetree shows it: no +0 or -0.
        if (sum?.[0]) segs.push({ t: `${NNBSP}+${sum[0]}`, c: GIT_HEX.add, right: true })
        if (sum?.[1]) segs.push({ t: `${NNBSP}-${sum[1]}`, c: GIT_HEX.del, right: true })
        const below = isDir ? dirCounts(git, entry.path) : null
        const tint = statusColor(code) ? { c: statusColor(code)! } : {}
        if (below) segs.push(...countSegs(below))
        else if (code) segs.push({ t: `${NNBSP}${gitLetter(code)}`, ...tint, right: true })
        else if (!isDir && entry.at) segs.push({ t: `${NNBSP}${stampOf(entry.at)}`, c: GIT_HEX.muted, right: true, opt: true })
        if (Client) {
          rowPresses.set(key, press)
          // Double-click a file to open it, right-click a row to copy its path (shift: the whole path).
          if (!isDir) rowOpens.set(key, () => actions.open(entry.path))
          rowCopies.set(key, (full, surface) => actions.copy(entry.path, full, surface))
          // As wide as the pane, so the row knows its room and fits itself (it never wraps).
          // Monospace, as filetree's terminal rows are: the dates and badges line up in a column.
          return <Client key={key} module="./row.tsx" width="100%" props={{ segs, mono: true, ...(isSelected ? { bg: SELECTED_BG } : {}) } satisfies RowProps} />
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
