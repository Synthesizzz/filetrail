// The Files tab: the tree under the project root with git status, changed
// line counts and how many times Claude edited each file.

import type { EngineInterface } from 'claude-code'

import type { Entry, FilesView, GitActionEntry, GitActionKind, GitInfo, Preview, SearchIndex, Tone, TouchedFile, Turn } from '../types'
import { dirCounts, dirStatus, fileStatus, lineCounts, linesBelow, repoSummary } from './git'
import type { DirCounts } from './git'
import { relTo } from './history'
import { treeWindow } from './activity'
import { NARROW_COLUMNS, NBSP, NNBSP, splitPath, stampOf } from './paths'
import type { RowProps, Seg } from './row'
import { rowCopies, rowOpens, rowPresses, toolPresses } from './presses'
import type { Tool, ToolsProps } from './tools'
import { NOW_STYLE, nowCard } from './now-card'
import { previewView } from './preview'
import type { PreviewActions } from './preview'
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
  /** Lists every touched file in the card, or only the latest few again. */
  toggleTouched: () => void
  /** Moves the tree a page up (-1) or down (1) under the head, holding the follow a while. */
  page: (dir: -1 | 1) => void
  /** Ends a hold of the follow and goes to the file Claude touched meanwhile. */
  backToClaude: () => void
  /** Lists the open folders again, reads git again and rebuilds the search's file list. */
  refresh: () => void
  /** Leaves dotfiles out of the tree, or shows them again. */
  toggleDots: () => void
  /** Closes every folder. */
  collapseAll: () => void
  /** Opens the tree down to the selected file and scrolls to it. */
  goToSelected: () => void
  /** Shows a file in the pane in place of the tree. */
  preview: (path: string) => void
  /** Opens the tree down to a file, selects it and scrolls to it. */
  reveal: (path: string) => void
  /** What the preview's buttons do. */
  previewing: PreviewActions
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

/** A chip's fill: a faint grey that reads on light and dark backgrounds alike. */
export const CHIP_BG = '#80808026'

/**
 * The branch and git as chips in the card's title bar: the branch with commits ahead
 * and behind, the repo's changes (or "clean"), and the latest git action Claude ran
 * (shimmering while it runs), with "N more" to list the others under the chips.
 */
function branchChips(els: Els, git: GitInfo | null, log: readonly GitActionEntry[], open: boolean, actions: FilesActions) {
  const { Box, Text, Button } = els
  const Client = 'Client' in els ? els.Client : undefined
  const chip = (key: string, runs: { t: string; c?: string; b?: boolean; dim?: boolean }[]) => (
    <Text key={key} backgroundColor={CHIP_BG}>
      {[{ t: NBSP }, ...runs, { t: NBSP }].map(r => <Text {...(r.c ? { color: r.c } : {})} {...(r.b ? { bold: true } : {})} {...(r.dim ? { dimColor: true } : {})}>{r.t}</Text>)}
    </Text>
  )
  const b = git?.branch
  const branch = !git
    ? chip('chip-branch', [{ t: 'not a git repo', dim: true }])
    : chip('chip-branch', [
      { t: b ? b.head : 'git', c: 'claude', b: true },
      ...(b?.ahead ? [{ t: ` ↑${b.ahead}`, dim: true }] : []),
      ...(b?.behind ? [{ t: ` ↓${b.behind}`, dim: true }] : []),
    ])
  const sum = repoSummary(git)
  const changes = sum
    ? [
      ...(sum.lines?.[0] ? [{ t: `+${sum.lines[0]}`, c: GIT_HEX.add }] : []),
      ...(sum.lines?.[1] ? [{ t: `-${sum.lines[1]}`, c: GIT_HEX.del }] : []),
      ...countSegs(sum.counts).map(s => ({ t: s.t.replace(NNBSP, ''), c: s.c! })),
    ]
    : []
  const repoChip = !sum ? null
    : changes.length
      ? chip('chip-changes', changes.flatMap((r, k) => (k ? [{ t: ' ' }, r] : [r])))
      : chip('chip-changes', [{ t: 'clean', dim: true }])
  // A finished git action is a plain chip. One running is a Client on a line of its own, as
  // wide as the card, for the shimmer: a Client sized by what it draws was refused for
  // changing its own size as it shimmered (seen live).
  const runs = (a: GitActionEntry) => gitActionSegs(a).map(s => ({ t: s.t, ...(s.c ? { c: s.c } : {}), ...(s.b ? { b: true } : {}), ...(s.dim ? { dim: true } : {}) }))
  const line = (a: GitActionEntry) => Client
    ? <Client key={`git-${a.id}`} module="./row.tsx" width="100%" props={{ segs: gitActionSegs(a), hoverAt: -1 } satisfies RowProps} />
    : <Text key={`git-${a.id}`}>{runs(a).map(r => <Text {...(r.c ? { color: r.c } : {})} {...(r.dim ? { dimColor: true } : {})}>{r.t}</Text>)}</Text>
  const latest = log.at(-1)
  const running = latest?.state === 'running'
  const more = log.length - 1
  return (
    <Box key="branch-chips" flexDirection="column" gap="xs">
      <Box key="chips" flexDirection="row" flexWrap="wrap" gap={1}>
        {branch}
        {repoChip}
        {latest && !running ? chip(`git-${latest.id}`, runs(latest)) : null}
        {more > 0 ? <Button key="git-more" label={open ? 'fewer' : `${more} more`} plain dimColor onPress={() => actions.toggleGitLog()} /> : null}
      </Box>
      {latest && running ? line(latest) : null}
      {/* The older ones, oldest first, while "N more" is open. */}
      {open ? log.slice(0, -1).map(line) : null}
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

/**
 * filetree's softer git palette, easier on the eye than the theme's own success, warning
 * and error, in a tree where many names carry one: yellow changed, green new, blue renamed,
 * red deleted or conflicted, and its greens and reds for lines added and removed.
 */
export const GIT_HEX = {
  changed: '#e5c07b', added: '#98c379', renamed: '#61afef', deleted: '#d0605e',
  add: '#98c379', del: '#e06c75', muted: '#808a96',
} as const

/** A file's kind as a short badge: its extension, upper-cased, three letters at most. */
export function badgeOf(path: string): string {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1, dot + 4).toUpperCase() : 'TXT'
}

/**
 * The files Claude touched this session, newest first, in the activity card under
 * Right now: a kind badge, the name, its folder, and a pill saying how (filled while
 * Claude is at it). A click goes to it in the tree, a double-click shows it, a
 * right-click copies its path.
 */
/** Touched files shown before "+N more": the card stays short so the tree keeps the room. */
export const TOUCHED_SHOWN = 3

function touchedSection(els: Els, root: string, touched: readonly TouchedFile[], flash: Readonly<Record<string, Tone>>, open: boolean, actions: FilesActions) {
  const { Box, Text, Button } = els
  const more = touched.length - TOUCHED_SHOWN
  const Client = 'Client' in els ? els.Client : undefined
  if (!touched.length) return []
  return [
    <Box key="touched" flexDirection="column" gap="xs">
      <Box key="touched-head" flexDirection="row" justifyContent="space-between">
        <Text size="caption" weight="semibold" dimColor>{`TOUCHED · ${touched.length}`}</Text>
        {more > 0 ? <Button key="touched-more" label={open ? 'fewer' : `+${more} more`} plain dimColor onPress={() => actions.toggleTouched()} /> : null}
      </Box>
      {(open ? touched : touched.slice(0, TOUCHED_SHOWN)).map(f => {
        const key = `touched-${lower(f.path)}`
        const { name, dir } = splitPath(relTo(root, f.path))
        const now = flash[lower(f.path)]
        const style = NOW_STYLE[now ?? f.tone]
        const segs: Seg[] = [
          { t: ` ${badgeOf(f.path)} `, c: GIT_HEX.changed, bg: '#e5c07b22', b: true },
          { t: `${NNBSP}${name}`, name: true, b: true, ...(now ? { c: style.color, sh: TONE_SHIMMER[now] } : {}) },
          // The folder gives way before the name when the row is short (seen live: "notes.…" beside a whole folder).
          ...(dir ? [{ t: `${NNBSP}${dir}`, dim: true, opt: true }] : []),
          now
            ? { t: ` ${style.pill} `, c: style.color, bg: style.fill, b: true, right: true }
            : { t: ` ${style.did[0]!.toUpperCase()}${style.did.slice(1)} `, c: style.color, right: true },
        ]
        if (Client) {
          rowPresses.set(key, () => actions.reveal(f.path))
          rowOpens.set(key, () => actions.preview(f.path))
          rowCopies.set(key, (full, surface) => actions.copy(f.path, full, surface))
          // Monospace, as the tree's rows: the row fits itself by counting cells (seen live: a
          // proportional name was cut short with room to spare).
          return <Client key={key} module="./row.tsx" width="100%" props={{ segs, mono: true } satisfies RowProps} />
        }
        return <Text key={key}>{segs.map(s => <Text {...(s.c ? { color: s.c } : {})} {...(s.dim ? { dimColor: true } : {})}>{s.t}</Text>)}</Text>
      })}
    </Box>,
  ]
}

export function statusColor(code: string): string | undefined {
  if (code === 'M') return GIT_HEX.changed
  if (code === 'R') return GIT_HEX.renamed
  if (code === 'A' || code === '?') return GIT_HEX.added
  if (code === 'D' || code === 'U') return GIT_HEX.deleted
  return undefined
}

export function filesView(
  els: Els, root: string, listing: Readonly<Record<string, Entry[]>>, files: FilesView,
  git: GitInfo | null, turns: readonly Turn[], flash: Readonly<Record<string, Tone>>,
  last: { path: string; tone: Tone } | null, actions: FilesActions, width = 60,
  searchIndex: SearchIndex | null = null, gitLog: readonly GitActionEntry[] = [], preview: Preview | null = null,
  touched: readonly TouchedFile[] = [],
  /** Tree rows the pane has room for under its head; null draws them all. */
  fit: number | null = null,
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
  // The tree scrolls under the head on its own first row (files.top), the head staying put.
  // The Following paused line, when shown, takes one of the tree's rows.
  const win = treeWindow(shown.length, files.top ?? 0, (fit ?? shown.length) - (fit !== null && files.away ? 1 : 0))
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
      {/* One card for the top of the pane: the folder, its toolbar, the branch and git as chips,
          then what Claude is doing right now and the files it touched this session. */}
      {nowCard(els, root, listing, last, flash, touchedSection(els, root, touched, flash, files.touchedOpen === true, actions), [
          <Box key="name-line" flexDirection="row" gap={1} minWidth={0}>
            <Box key="name-box" flexShrink={1} minWidth={0}>
              <Text bold color={FOLDER_COLOR} wrap="truncate-end">{name}</Text>
            </Box>
            {/* filetree's header buttons, its plain Unicode glyphs. A Client draws them where it can, so
                hovering one says what it does (a desktop Button has no tooltip); Buttons elsewhere. */}
            {Client
              ? <Client key="tree-tools" module="./tools.tsx" flexGrow={1} props={{ tools: tools.map(({ id, glyph, hint }) => ({ id, glyph, hint })) } satisfies ToolsProps} />
              : (
                <Box key="tree-tools" flexDirection="row" gap={1} flexGrow={1} justifyContent="flex-end">
                  {tools.map(t => <Button key={t.id} label={t.glyph} plain dimColor onPress={t.run} />)}
                </Box>
              )}
          </Box>,
        branchChips(els, git, gitLog, files.gitOpen === true, actions),
      ], width < NARROW_COLUMNS)}
      {Input && !preview && (
        <Box key="search-row" flexDirection="row" gap={1}>
          <Box key="search-box" flexGrow={1} flexDirection="column">
            <Input key="search" placeholder="Search files" value={query} onInput={(v: string) => actions.search(v)} onSubmit={(v: string) => actions.search(v)} />
          </Box>
          {searching && <Button key="search-clear" label="✕" plain dimColor onPress={() => actions.search('')} />}
        </Box>
      )}
      {/* The file picked for Claude rides along with every prompt until ✕: one slim line, so it is never missed. */}
      {files.selected !== null ? (
        <Box key="selected" flexDirection="row" flexWrap="wrap" gap={1}>
          <Text color="claude">Claude sees</Text>
          <Text bold wrap="truncate-end">{splitPath(relTo(root, files.selected)).name}</Text>
          {splitPath(relTo(root, files.selected)).dir ? <Text dimColor wrap="truncate-start">{splitPath(relTo(root, files.selected)).dir}</Text> : null}
          {/* No hotkey: the desktop draws its chip beside the label, which read as "X ✕" (seen live). */}
          <Button key="unselect" label="✕" plain dimColor onPress={() => actions.unselect()} />
          {selectedSteps
            ? <Button key="file-history" label={`History ${selectedSteps}`} plain dimColor onPress={() => actions.history(files.selected!)} />
            : null}
          <Button key="open-file" label="Open" plain dimColor onPress={() => actions.open(files.selected!)} />
          <Button key="copy-path" label="Copy path" plain dimColor onPress={press => actions.copy(files.selected!, false, press.surface)} />
          <Button key="copy-full" label="Full path" plain dimColor onPress={press => actions.copy(files.selected!, true, press.surface)} />
          {selectedSteps ? null : <Text dimColor>no edits recorded</Text>}
        </Box>
      ) : null}
      {/* A file shown in the pane takes the tree's place; ← files brings the tree back as it was. */}
      {preview ? previewView(els, root, preview, actions.previewing, flash[lower(preview.path)] ? TONE_COLOR[flash[lower(preview.path)]!] : undefined) : searching ? searchResults(els, query, searchIndex, actions) : (
      <Box key="tree" flexDirection="column">
      {!(lower(root) in listing) && <Text dimColor>Reading the folder…</Text>}
      {lower(root) in listing && rows.length === 0 && <Text dimColor>This folder is empty.</Text>}
      {/* Claude moved on while the person was scrolling the tree: the follow waited. */}
      {files.away ? (
        <Box key="follow-paused" flexDirection="row" gap={1}>
          <Text dimColor>Following paused</Text>
          <Button key="back-to-claude" label="⌖ Back to Claude" plain onPress={() => actions.backToClaude()} />
        </Box>
      ) : null}
      {/* The tree's scroll marks, in place of a scrollbar: a press moves it a page. */}
      {win.above ? <Button key="tree-above" label={`▲ ${win.above} above`} plain dimColor onPress={() => actions.page(-1)} /> : null}
      {shown.slice(win.start, win.end).map(({ entry, depth, isOpen }) => {
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
          // Double-click a file to show it here, right-click a row to copy its path (shift: the whole path).
          if (!isDir) rowOpens.set(key, () => actions.preview(entry.path))
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
      {win.below ? <Button key="tree-below" label={`▼ ${win.below} below`} plain dimColor onPress={() => actions.page(1)} /> : null}
      {rows.length > shown.length && <Text dimColor>… {rows.length - shown.length} more rows (close a folder to see them)</Text>}
      </Box>
      )}
    </Box>
  )
}
