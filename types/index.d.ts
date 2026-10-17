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
  /** True once Show all unfolded the step's diff past its first lines; a move to another step folds it. */
  full?: boolean
}

/** The band's offer after a turn that changed files: which turn, and what it changed. */
export type Hint = { turn: string; edits: number; files: number }

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

/** The Files tab: open folders (lower-cased paths), the selected path, and the search box's text ('' or absent: the tree). */
export type FilesView = { expanded: string[]; selected: string | null; query?: string }

/** Every file of the project, relative to its root, for the search box; `complete` false when the list was cut short. */
export type SearchIndex = { files: string[]; complete: boolean }

/** How Claude touched a path just now. */
export type Tone = 'read' | 'write' | 'commit'

/** What a git action does, which picks its colour in the bar. */
export type GitActionKind = 'save' | 'sync' | 'fetch' | 'branch' | 'merge' | 'stash'

/** One git action in the bar at the bottom of the Files tab. */
export type GitActionEntry = {
  id: string
  /** The bare verb (push), for "push failed". */
  verb: string
  running: string
  done: string
  kind: GitActionKind
  /** What the action named (a branch, a remote), '' when nothing. */
  target: string
  /** The folder it ran in when not the project's own (a cd or git -C moved it), '' otherwise. */
  repo: string
  state: 'running' | 'ok' | 'failed' | 'denied'
  at: number
}

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
      /** What the band above the prompt offers to replay; null once replayed or before any edit. */
      hint: Hint | null
      /** The turn running now, while it has edits: shown as "Now" on the timeline until it is saved. */
      live: Turn | null
      /** The files the search box looks through; null until the first search, built again after each turn. */
      index: SearchIndex | null
      /** The last git actions run through Bash, newest last: running, then done or failed, until newer ones push them out. */
      actions: GitActionEntry[]
    }
  }
}
