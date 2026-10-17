export type Tab = 'files' | 'history'

export type DiffLine = { op: ' ' | '+' | '-' | '~'; t: string }

/** pending: the tool has not answered yet; denied: refused; failed: answered with an error. */
export type StepStatus = 'pending' | 'ok' | 'denied' | 'failed'

/** One file change Claude made: one Edit or Write, or one edit of a MultiEdit. */
export type Step = {
  id: string
  /** Absolute path, forward slashes. */
  path: string
  /** Path relative to the project root, or the absolute path outside it. */
  rel: string
  tool: string
  note: string
  status: StepStatus
  /** 1-based line where the change starts in the file as it was, when known. */
  line: number | null
  add: number
  del: number
  diff: DiffLine[]
  at: number
}

/** One main-loop turn that changed files. */
export type Turn = {
  id: string
  at: number
  /** First line of the prompt that started the turn, "" when none was typed. */
  prompt: string
  steps: Step[]
}

/**
 * Where the History tab stands. `turn` null and `file` null: the timeline.
 * `turn` set: that turn's steps. `file` set: that file's steps across turns.
 * `step` indexes the steps on show.
 */
export type HistoryView = {
  turn: string | null
  file: string | null
  step: number
}

/** One row of a directory listing. `path` is absolute, forward slashes, as the disk spells it. */
export type Entry = { name: string; path: string; kind: 'dir' | 'file' }

export type Branch = { head: string; upstream: string; ahead: number; behind: number }

/**
 * The repo around the project root, null outside one. Keys of `status` and
 * `numstat` are paths relative to `top`, lower-cased; `untrackedDirs` end in '/'.
 * Status codes: M modified, A added, D deleted, R renamed, ? untracked, U conflict.
 */
export type GitInfo = {
  top: string
  branch: Branch | null
  status: Record<string, string>
  untrackedDirs: string[]
  numstat: Record<string, [number, number]>
}

/** The Files tab: open folders (lower-cased paths) and the selected path. */
export type FilesView = { expanded: string[]; selected: string | null }

/** How Claude touched a path just now. */
export type Tone = 'read' | 'write'

declare module 'claude-code' {
  interface PluginState {
    filetrail: {
      tab: Tab
      history: Turn[]
      view: HistoryView
      /** Listings by lower-cased directory path, filled as folders open. */
      listing: Record<string, Entry[]>
      git: GitInfo | null
      files: FilesView
      /** Paths Claude touched in the last moments (lower-cased), lit in the tree. */
      flash: Record<string, Tone>
      /** The path Claude touched last (lower-cased) and how: marked ◂ until another is touched. */
      last: { path: string; tone: Tone } | null
    }
  }
}
