export type Tab = 'files' | 'history'

export type DiffLine = { op: ' ' | '+' | '-' | '~'; t: string }

/** pending: the tool has not answered yet; denied: refused; failed: answered with an error. */
export type StepStatus = 'pending' | 'ok' | 'denied' | 'failed'

/**
 * One file change: one Edit or Write, or one edit of a MultiEdit, by Claude; or a file
 * deleted (tool `Delete`), by Claude or the person, its text kept as removed lines.
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
 * `top`: the first tree row on show, the tree scrolling under the pane's fixed head.
 * `away`: the file (lower-cased) Claude touched while the person held the follow by scrolling.
 */
export type FilesView = { expanded: string[]; selected: string | null; query?: string; gitOpen?: boolean; hideDots?: boolean; touchedOpen?: boolean; top?: number; away?: string }

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
export type Preview = { path: string; page: number; source?: string; total?: number; reason?: 'binary' | 'large' | 'missing' }

/** A file Claude read, edited or committed this session, for the Claude touched list: its path as spelled, how, and when. */
export type TouchedFile = { path: string; tone: Tone; at: number; by?: DeletedBy }

/** What a git action does, which picks its colour in the bar. */
export type GitActionKind = 'save' | 'sync' | 'fetch' | 'branch' | 'merge' | 'stash'

/** The GitHub icon (an Octicon) drawn beside a git action or the branch. */
export type GitIcon = 'branch' | 'merge' | 'commit' | 'push' | 'pull' | 'pr' | 'stash'

/** A git action the crab acts out in the card, beyond a commit: pushing, or merging. */
export type GitPose = 'push' | 'merge'

/**
 * The git action the card's crab acts out: running, then done for FLASH_MS; null once
 * it is over, or when it failed. `target` is what it named (a branch, a remote).
 */
export type GitStage = { pose: GitPose; state: 'running' | 'ok'; target: string }

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
      last: { path: string; tone: Tone } | null
      /** What the band above the prompt offers to replay; null once replayed or before any edit. */
      hint: Hint | null
      /** The turn running now, while it has edits: shown as "Now" on the timeline until it is saved. */
      live: Turn | null
      /** The files the search box looks through; null until the first search, built again after each turn. */
      index: SearchIndex | null
      /** The last git actions run through Bash, newest last: running, then done or failed, until newer ones push them out. */
      actions: GitActionEntry[]
      /** The push or merge the card's crab acts out, while it runs and a moment after; null otherwise. */
      stage: GitStage | null
      /** The file shown in place of the tree, or null for the tree. */
      preview: Preview | null
      /** The files Claude touched this session, newest first, eight at most. */
      touched: TouchedFile[]
      /** The Files tab's head (tabs, card, search) in the pane's rows, as last measured from the wheel; null before. */
      head: number | null
      /** The files of the history git ignores (lower-cased), left out of History. */
      ignored: string[]
    }
  }
}
