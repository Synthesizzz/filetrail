// What filetrail tells Claude about the tree, and what it reads from a prompt.
// No engine calls here.

import { normPath, relTo } from './history'
import { joinPath } from './tree'

/**
 * The line attached to each prompt while a file is selected. It says what is
 * selected and no more: a selection is a hint about "this file", not a request,
 * and it carries no file content.
 */
export function contextLine(root: string, selected: string): string {
  const path = normPath(selected)
  const rel = relTo(root, path)
  const where = rel === path ? path : `${rel} (full path: ${path})`
  return `filetrail: the user has selected ${where} in the file tree. When they say "this file" they likely mean it; the selection alone is not a request.`
}

/**
 * The paths a prompt mentions with @: `@src/a.ts` or `@"docs/my file.md"`.
 * An @ inside a word (an email address) is not a mention; trailing
 * punctuation is not part of the path.
 */
export function mentionedPaths(text: string): string[] {
  const out: string[] = []
  const re = /(^|\s)@(?:"([^"]+)"|([^\s"]+))/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = (m[2] ?? m[3] ?? '').replace(/[.,;:!?)\]]+$/, '')
    if (raw) out.push(raw)
  }
  return out
}

/** A mention as an absolute path: an absolute one as written, a relative one under the root. */
export function resolveMention(root: string, mention: string): string {
  const p = normPath(mention)
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) return p
  return joinPath(root, p.replace(/^\.\//, ''))
}
