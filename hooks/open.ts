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

/** The variable a Windows reveal hands the path over in. */
export const REVEAL_ENV = 'FILETRAIL_REVEAL'

/** A reveal to run: its argument vector, and the variables it needs (the path, on Windows). */
export type Reveal = { argv: string[]; env?: Record<string, string> }

/**
 * The command that shows `path` in the system's file manager, run without a shell: a file
 * is selected in its folder (Windows `explorer /select,`, a Mac's `open -R`), a folder is
 * opened. Linux has no select, so a file's folder opens.
 *
 * On Windows explorer is started by PowerShell's Start-Process: the engine runs a child
 * with its window hidden, and explorer run straight from it opened the folder in a hidden
 * window (seen live: "opened folder" said, no window). Start-Process starts it shown. The
 * path rides in an env var, not the command line, so &, % and spaces need no quoting.
 */
export function revealCommand(os: HostOs, path: string, isDir: boolean): Reveal {
  const p = normPath(path)
  if (os === 'windows') {
    const arg = isDir ? `'"' + $env:${REVEAL_ENV} + '"'` : `'/select,"' + $env:${REVEAL_ENV} + '"'`
    return {
      argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath explorer.exe -ArgumentList (${arg})`],
      env: { [REVEAL_ENV]: p.replace(/\//g, '\\') },
    }
  }
  if (os === 'mac') return { argv: isDir ? ['open', p] : ['open', '-R', p] }
  return { argv: ['xdg-open', isDir ? p : p.slice(0, Math.max(1, p.lastIndexOf('/')))] }
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
