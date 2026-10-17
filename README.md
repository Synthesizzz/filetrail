# filetrail

A file tree and a history of Claude's edits in one pane for Claude Code, with Files and History tabs.

## What it does

### Files

- The tree under the session's working folder. Folders open on a click and are read as they open; `.git` is hidden.
- Git status per file in colour: yellow for modified or renamed, green for added or untracked, red for deleted or conflicted. Changed files show `+N -N`, and the header shows the branch with commits ahead (↑) and behind (↓). Outside a repo git is asked once and the header says so; a `git init` or `git clone` Claude runs makes it ask again.
- A folder counts the changes beneath it by kind: `M:n` (yellow) changed, `?:n` (green) new, `D:n` (red) deleted. A folder git reports as untracked as a whole shows `?`, since git lists nothing inside it.
- `●N` beside a file counts the edits Claude made to it that went through; a closed folder shows `●` when a file inside it was edited.
- When Claude reads a file (Read) the row lights violet with `· reading`; when Claude changes it (Edit, Write, MultiEdit, NotebookEdit) it lights orange with `· writing`, once the change has gone through. While lit, a bright band sweeps across the name letter by letter, as if it were being typed. The light lasts 5 seconds, and the last file Claude touched keeps a `◂` until another file is touched. The tree opens down to the file and scrolls to it. A search (Grep, Glob) with a folder lights that folder if it is on show, without opening anything.
- Bash is read for the files it touches, from the command's words only: a file a reader names (`cat`, `head`, `tail`, `less`, `wc`, `bat`, `Get-Content` and the like) lights and is followed like a Read; a path a search or listing names (`rg`, `grep`, `find`, `ls`, `fd`, `Select-String`) lights without opening anything. A command with a word built at run time (`$VAR`, backticks) is skipped, and so is anything after a `cd`. After a `git commit` goes through, the files it committed light green with `· committed`.
- A bar under the branch shows the last three git actions Claude ran through Bash (commit, push, pull, fetch, checkout, switch, merge, rebase, stash, and `gh pr create`, `merge`, `checkout`): `… pushing origin main` shimmering while it runs, then `✓ pushed origin main`, a red `✗ push failed`, or a dim `⊘ push denied`. An action run in another folder (after a `cd`, or with git's `-C`) names it, as in `✓ committed · filetrail`, so another repo's commit is not taken for this project's. They stay until newer ones push them out.
- The search box finds files by name across the project (git's file list in a repo, a walk of the folders otherwise, skipping `node_modules` and the like): names that start with the text first, then names that contain it, then paths. The results replace the tree; picking one opens the tree to it, selected. ✕ goes back to the tree.
- Selecting a file shows `Claude sees: <file>` under the header: every prompt you send then carries one line naming the file, so "this file" means it, until ✕ clears the selection. Beside it: History (N) opens its history, Open opens it in the machine's default app, and Copy path and Copy full path put its path from the project root, or whole, on the clipboard.
- `@path` in a prompt that names a file of the project opens the tree to it and selects it.
- In a narrow pane a row never wraps: the name is cut with `…` first, then the counts after it give way; the `· reading` word always stays.

### History

- A timeline of the turns that changed files, newest first: the time in blue, the first line of the prompt, and how many files, edits and lines changed (`+N` green, `-N` red). Edits that were refused or failed are counted as not applied, in yellow.
- After a turn that changed files, a line above the prompt offers it: `▶ filetrail: 5 edits in 3 files [Replay]`. Replay (or `r` once the band has the keys) opens that turn in History on its first edit, with the keyboard on the pane, so Enter steps forward and Escape closes it. The offer stays until it is replayed or another turn changes files; a turn that changes nothing leaves it. It sits under whatever other mods draw there.
- While Claude works, the turn in progress sits at the top of the timeline as **Now**, shimmering orange, growing with each edit; an edit whose tool has not answered yet shows `running…`. When the turn ends it becomes an ordinary saved turn, and a view left open on it stays on it.
- Open a turn to step through its edits one diff at a time: a strip of numbered cells, Prev and Next, the file, the tool, the line where the change starts, `+N -N`, and a diff with line numbers. Refused and failed edits are marked. A diff longer than 20 lines folds there with a Show all button; moving to another edit folds it again.
- The layout follows the pane's width. Diff lines wrap rather than being cut, keeping their indentation. Below about 56 columns a path shows its file name first with the folder dimmed after it, and titles take up to two lines. From about 100 columns History splits in two: the turn list on the left and, on the right, the turn picked there (the latest until you pick one).
- Only files inside the project folder are recorded; an edit elsewhere (a temporary file, a config file in your home folder) is left out.
- Click a file name to see that file's edits across every turn. Show in Files takes you to it in the tree.
- Ask Claude puts the step (file, turn and diff, up to 40 lines) after whatever is in the prompt box, so you can type a question and send it yourself.
- Export writes the project's whole history as Markdown to `~/.claude/filetrail/exports/<project>-<YYYYMMDD-HHMM>.md`.
- The history is kept across sessions, per project: the last 50 turns of each, at most 3 MiB for all projects together (the least recently used project goes first), and up to 200 diff lines per edit (the counts still cover the whole change).

## Install

```
claude plugin marketplace add Synthesizzz/filetrail
claude plugin install filetrail@filetrail-mods --scope user
```

Claude Code runs an installed copy of the mod. After a change, raise `version` in `.claude-plugin/plugin.json`, then run `claude plugin marketplace update filetrail-mods` and `claude plugin update filetrail@filetrail-mods`, and start a new session.

`.claude-plugin/types/` is generated by Claude Code for type checking and is not committed.

## /trail

- `/trail`: open the pane
- `/trail replay`: open the latest turn that changed files, as Replay does
- `/trail export`: write the history as Markdown and say where
- `/trail clear`: say how many turns of this project's history would be deleted; `/trail clear yes` deletes them. Other projects are left alone.

## Keys

While the pane has the keyboard:

| Key | Does |
|---|---|
| `f`, `h` | Files tab, History tab |
| `p`, `n` | Previous and next edit |
| `b` | Back to the timeline |
| `t` | From a file's history to the turn of the edit on show |
| `o` | Show the edit's file in Files |
| `a` | Ask Claude about the edit on show |
| `s` | Show all, or show fewer, lines of a long diff |
| `c`, Escape | Close the pane (Escape when it was opened by Replay) |
| `e` | Export (on the timeline) |

In the band above the prompt, `r` presses Replay once the band has the keys (a click, or ctrl+x tab).

## Limits

- The pane is the mod's own; it does not draw into the Claude desktop app's Files panel, which mods cannot reach. The desktop docks it on the right.
- Built and checked on the desktop app. It draws in the terminal too, but the terminal layout has had less care.
- Tree rows and timeline titles are drawn by a small surface module (`hooks/row.tsx`), not as buttons, because a desktop button drops the colours of the text in it. They take a click and, once clicked, Enter; they have no hotkeys of their own.
- Only the built-in file tools are recorded in the history. A file a Bash command changes is not in it (its reads are lit, as above); the tree and git status still catch up when the turn ends.
- Bash is read from the command's words, not its output, so an unusual command may be lit in the wrong place or not at all. The git bar counts a command as failed when the Bash call reports an error.
- An Edit's diff is between the text it replaced and the new text, not the whole file. A Write reads the file first; files over 400 lines show as all removed, then all added.
- A deleted file does not show in the tree. A folder with more than 500 entries shows the first 500.
- The project is the folder the session started in; a change of folder mid-session still records into it.

## Development

```
claude plugin validate .
claude plugin test .
```

Type checking uses the types Claude Code lays in `.claude-plugin/types/` once it has loaded the mod: `tsc -p .`.

## Credits

`hooks/diff.ts` is adapted from Replay Theater in [claude-code-playground](https://github.com/anthropics/claude-code-playground) (Apache License 2.0). See NOTICE. The replay offer after a turn, opening it with the keyboard on the pane, and folding long diffs follow Replay Theater's design.

Drawing rows in a surface module pressed through the pointer, the shimmer, and the git bar's verbs and colours follow [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) by Kurt Buhler (MIT License), whose feature set also inspired the tree. See NOTICE.

## License

Apache License 2.0. See LICENSE.
