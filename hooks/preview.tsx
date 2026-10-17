// A file shown in the pane in place of the tree: Markdown rendered, code highlighted
// with line numbers, a page at a time (one drawing holds 100,000 characters at most).
// Showing a file in the pane, with a way back to the tree and one out to the default
// app, follows the filetree mod (MIT); see NOTICE. Reading the file is register's.

import type { EngineInterface } from 'claude-code'

import type { Preview } from '../types'
import { splitPath } from './paths'
import { relTo } from './history'

type Els = ReturnType<EngineInterface['ui']['resolve']>

/** Lines a page shows. */
export const PAGE_LINES = 400
/** Files larger than this are not previewed (the read itself stops at 4 MiB). */
export const MAX_PREVIEW_CHARS = 2 * 1024 * 1024
/** How far into a file a NUL byte marks it as binary. */
const BINARY_PROBE = 8000

/** Why a file cannot be shown, or null when it can. */
export function refusal(text: string): Preview['reason'] | null {
  if (text.length > MAX_PREVIEW_CHARS) return 'large'
  if (text.slice(0, BINARY_PROBE).includes('\0')) return 'binary'
  return null
}

/** The page holding a 1-based line. */
export function pageOf(line: number | null | undefined): number {
  return line && line > 0 ? Math.floor((line - 1) / PAGE_LINES) : 0
}

/** One page of a file: its text, its first line's number, and the file's line count. */
export function pageText(text: string, page: number): { source: string; first: number; total: number } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  const total = lines.length
  const last = Math.max(0, Math.ceil(total / PAGE_LINES) - 1)
  const p = Math.min(Math.max(0, page), last)
  return { source: lines.slice(p * PAGE_LINES, (p + 1) * PAGE_LINES).join('\n'), first: p * PAGE_LINES + 1, total }
}

export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path)

export type PreviewActions = {
  /** Back to the tree, as it was left. */
  back: () => void
  /** The file in its default app. */
  open: (path: string) => void
  /** Another page. */
  page: (page: number) => void
}

const REASONS: Record<NonNullable<Preview['reason']>, string> = {
  binary: 'This looks like a binary file, so it is not shown here.',
  large: 'This file is over 2 MB, too large to show here.',
  missing: 'This file could not be read (moved or deleted?).',
}

export function previewView(els: Els, root: string, preview: Preview, actions: PreviewActions, lit: string | undefined) {
  const { Box, Text, Button, Code, Markdown } = els
  const { name, dir } = splitPath(relTo(root, preview.path))
  const pages = Math.max(1, Math.ceil((preview.total ?? 0) / PAGE_LINES))
  const first = preview.page * PAGE_LINES + 1
  const lastLine = Math.min(preview.total ?? 0, first + PAGE_LINES - 1)
  return (
    <Box key="preview" flexDirection="column" gap="xs">
      <Box key="preview-bar" flexDirection="row" flexWrap="wrap" gap={1}>
        <Button key="preview-back" label="← files" plain dimColor onPress={() => actions.back()} />
        <Text bold {...(lit ? { color: lit } : {})} wrap="truncate-end">{name}</Text>
        {dir ? <Text dimColor wrap="truncate-start">{dir}</Text> : null}
        <Box flexGrow={1} />
        <Button key="preview-open" label="↗" plain dimColor onPress={() => actions.open(preview.path)} />
      </Box>
      {pages > 1 && (
        <Box key="preview-pages" flexDirection="row" gap={1}>
          <Button key="preview-prev" label="◀" plain dimColor onPress={() => actions.page(preview.page - 1)} />
          <Text dimColor>{`lines ${first}–${lastLine} of ${preview.total}`}</Text>
          <Button key="preview-next" label="▶" plain dimColor onPress={() => actions.page(preview.page + 1)} />
        </Box>
      )}
      {preview.reason
        ? <Text dimColor>{REASONS[preview.reason]}</Text>
        : preview.source === undefined
          ? <Text dimColor>Reading the file…</Text>
          : preview.source === ''
            ? <Text dimColor>This file is empty.</Text>
            : isMarkdown(preview.path)
              ? <Markdown key="preview-md" text={preview.source} />
              : <Code source={preview.source} path={preview.path} startLine={first} wrap="wrap" />}
    </Box>
  )
}
