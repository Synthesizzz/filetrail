export type Tab = 'files' | 'history' | 'agents'

export type DiffLine = { op: ' ' | '+' | '-' | '~'; t: string }

/** pending: the tool has not answered yet; denied: refused; failed: answered with an error. */
export type StepStatus = 'pending' | 'ok' | 'denied' | 'failed'

/**
 * One file change: one Edit or Write, or one edit of a MultiEdit, by Claude; a file
 * deleted (tool `Delete`), by Claude or the person, its text kept as removed lines; or a file
 * a shell command shrank or overwrote (tool `Bash`), the diff from its old text to its new.
 */
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

/** Who stopped a tool call: a hook, Claude Code itself (its permission rules, a person saying no), or the tool failing. */
export type BlockedKind = 'hook' | 'harness' | 'failed'

/** A tool call that was refused or failed: the tool, what it acted on, and why, when the engine said. */
export type Blocked = {
  id: string
  tool: string
  /** The command, file, pattern or address the call named, one line cut to 160 characters; '' when it named none. */
  call: string
  /** The engine's reason, its first line cut to 200 characters; '' when it gave none. */
  reason: string
  kind: BlockedKind
  at: number
}

/** One main-loop turn that changed files, or had a call refused or failed. */
export type Turn = {
  id: string
  at: number
  /** First line of the prompt that started the turn, "" when none was typed. */
  prompt: string
  steps: Step[]
  /** Calls of the turn that were refused or failed, in order; absent when none was. */
  blocked?: Blocked[]
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
/** `at`: a file's last change (ms since the epoch), as the listing gave it. */
export type Entry = { name: string; path: string; kind: 'dir' | 'file'; at?: number }

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
/**
 * `gitOpen`: the git bar shows every kept action, not only the latest. `hideDots`: dotfiles left out of the tree.
 * `touchedOpen`: the card lists every touched file, not only the latest few.
 */
export type FilesView = { expanded: string[]; selected: string | null; query?: string; gitOpen?: boolean; hideDots?: boolean; touchedOpen?: boolean; mode?: TreeMode; touchedRows?: number }

/** The tree's view: the whole project, or only the way down to what Claude touched this turn. */
export type TreeMode = 'all' | 'now'

/** Every file of the project, relative to its root, for the search box; `complete` false when the list was cut short. */
export type SearchIndex = { files: string[]; complete: boolean }

/** How Claude touched a path just now; `delete` also for a file the person deleted. */
export type Tone = 'read' | 'write' | 'commit' | 'delete'

/** Who deleted a file: Claude (a command it ran, or during its turn), or the person, outside one. */
export type DeletedBy = 'claude' | 'you'

/**
 * A file shown in the pane in place of the tree, a page at a time: the page's text and
 * the file's line count once read, or why it is not shown.
 */
export type Preview = { path: string; page: number; source?: string; total?: number; reason?: 'binary' | 'large' | 'missing'; image?: PreviewImage }

/**
 * A PNG, JPEG or SVG file shown in the pane: its size in pixels (null when its header holds none),
 * its size in bytes, and, when small enough to draw, the one SVG drawing that shows it and the
 * pixels to draw it at.
 */
export type PreviewImage = {
  kind: 'png' | 'jpeg' | 'svg'
  width: number | null
  height: number | null
  bytes: number
  svg?: string
  drawWidth?: number
  drawHeight?: number
}

/**
 * A file Claude read, edited or committed this session, for the Claude touched list: its path as spelled, how, and when.
 * `flag`: a shell command shrank or overwrote it (the card's word for it, "Shrank −67%").
 */
export type TouchedFile = { path: string; tone: Tone; at: number; by?: DeletedBy; flag?: string }

/** One run of a test command: what ran, whether it passed, when it ended, how long it took, and whether it named a test file (`file`) or ran the suite (`full`). */
export type TestRun = { command: string; ok: boolean; at: number; ms: number; scope: 'file' | 'full' }

/** The session's test runs: the last, and the last per-file and full ones. */
export type TestRuns = { last: TestRun; file?: TestRun; full?: TestRun; /** The `at` of the last run when the person put its line away: a newer run shows again. */ hidden?: number }

/** A file a helper read or wrote: absolute path, forward slashes. A write outranks a read of the same file. */
export type HelperFile = { path: string; tone: 'read' | 'write' }

/**
 * A helper (a subagent) of this session: its engine id, the type it was spawned as, the task
 * it was given, how it stands, when it started and ended, how many tools it called, and the
 * files it read or wrote (read from the engine's own events; a command's effects are not here).
 */
export type Helper = {
  id: string
  type: string
  description: string
  state: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt: number | null
  calls: number
  files: HelperFile[]
}

/** What changed a file Claude had read: its own edit, a commit holding the file, or a change from outside the session. */
export type StaleBy = 'commit' | 'outside'

/** A file Claude read that has changed since: by what, and when it was found. */
export type StaleMark = { by: StaleBy[]; at: number }

/** What a git action does, which picks its colour in the bar. */
export type GitActionKind = 'save' | 'sync' | 'fetch' | 'branch' | 'merge' | 'stash'

/** The GitHub icon (an Octicon) drawn beside a git action or the branch. */
export type GitIcon = 'branch' | 'merge' | 'commit' | 'push' | 'pull' | 'pr' | 'stash'

/** A git action the crab acts out in the card, beyond a commit: pushing, or merging. */
export type GitPose = 'push' | 'merge'

/** What the card's crab acts out besides a file: a push, a merge, a search, a shell command, tests, a helper, or an error. */
export type StagePose = GitPose | 'search' | 'command' | 'test' | 'agent' | 'error'

/**
 * What Claude is doing that the card's crab acts out, besides reading or editing a file:
 * running, then done (or failed) for FLASH_MS, then null. `target` is what it named (a
 * branch, a pattern, a command), `dir` a dimmed detail after it, `word` the card's word
 * when it is not the pose's own (an error's "Edit failed"), `at` when it started: the
 * newest of a stage and a touched file is the one shown.
 */
export type Stage = { pose: StagePose; state: 'running' | 'ok' | 'failed'; target: string; dir?: string; word?: string; at: number }

/** One git action in the bar at the bottom of the Files tab. */
export type GitActionEntry = {
  id: string
  /** The bare verb (push), for "push failed". */
  verb: string
  running: string
  done: string
  kind: GitActionKind
  icon: GitIcon
  /** The crab's pose for it, when it has one (a push, a merge). */
  pose?: GitPose
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
      last: { path: string; tone: Tone; at?: number } | null
      /** What the band above the prompt offers to replay; null once replayed or before any edit. */
      hint: Hint | null
      /** The turn running now, while it has edits: shown as "Now" on the timeline until it is saved. */
      live: Turn | null
      /** The files the search box looks through; null until the first search, built again after each turn. */
      index: SearchIndex | null
      /** The last git actions run through Bash, newest last: running, then done or failed, until newer ones push them out. */
      actions: GitActionEntry[]
      /** What the crab acts out besides a file (a push, a search, tests, an error), while it runs and a moment after; null otherwise. */
      stage: Stage | null
      /** Whether a main-loop turn is running: the crab thinks while nothing else shows. */
      working: boolean
      /** The files Claude read, edited, committed or deleted in the current turn (the last, once it ended), newest last: the Now tree. */
      turnFiles: string[]
      /** The file shown in place of the tree, or null for the tree. */
      preview: Preview | null
      /** The files and folders Claude may not change, as full paths (a copy of the store's list, for the tree to draw). */
      guards: string[]
      /** The files Claude touched this session, newest first, eight at most. */
      touched: TouchedFile[]
      /** The files of the history git ignores (lower-cased), left out of History. */
      ignored: string[]
      /** This session's test runs, kept on the card after the chip is gone; null before the first. */
      tests: TestRuns | null
      /** Files Claude read that changed since (lower-cased paths): marked in the tree and the touched list. */
      stale: Record<string, StaleMark>
      /** This session's helpers (subagents), oldest first; empty until one starts. A reload forgets them. */
      helpers: Helper[]
      /** The helpers (by id) whose rows in the Agents tab are open to their files. */
      helpersOpen: string[]
    }
  }
}
