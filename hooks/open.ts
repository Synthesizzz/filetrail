// Opening a file in the machine's default app, and the path text a copy puts
// on the clipboard. No engine calls here.

import { normPath, relTo } from './history'

export type HostOs = 'windows' | 'mac' | 'linux'

/** A drive-letter root means Windows; otherwise `uname -s` decides (Darwin is a Mac). */
export function osOf(root: string, uname: string): HostOs {
  if (/^[A-Za-z]:[\\/]/.test(root)) return 'windows'
  return /darwin/i.test(uname) ? 'mac' : 'linux'
}

/**
 * The command that opens `path` with its default app, as an argument vector run
 * without a shell. On Windows `start` is cmd's own: its first quoted argument is
 * the window title, so an empty one goes first, and the path is passed whole
 * with backslashes.
 */
export function openCommand(os: HostOs, path: string): string[] {
  if (os === 'windows') return ['cmd', '/c', 'start', '', normPath(path).replace(/\//g, '\\')]
  if (os === 'mac') return ['open', path]
  return ['xdg-open', path]
}

/** What Copy path puts on the clipboard: the path from the project root, forward slashes. */
export function relativeCopy(root: string, path: string): string {
  return relTo(root, path)
}

/** What Copy full path puts there: the absolute path as the system writes it (backslashes on Windows). */
export function fullCopy(os: HostOs, path: string): string {
  const p = normPath(path)
  return os === 'windows' ? p.replace(/\//g, '\\') : p
}
