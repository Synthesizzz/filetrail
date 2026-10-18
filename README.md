# filetrail

A file tree and a history of Claude's edits in one pane for Claude Code, with Files and History tabs.

## What it does

### Files

- One card heads the pane. Its title bar has the folder, the toolbar, and chips for the branch (with commits ahead ↑ and behind ↓), the repo's changes (`+3 -1 ?:2 M:1`, or `clean`) and the latest git action Claude ran, with `N more` to list the older ones. Below that the card says what Claude is doing right now: the Claude crab in a pose for it (reading a book, writing with a pencil, cheering a commit with a tick, asleep when idle) and one line, "Reading client.test.js · tests" with the folder dimmed, then a pill in the tone's colour (violet reading, orange editing, green committing). Between actions it says `Idle` and names the last file touched. Below, `TOUCHED · N` lists the files Claude read, edited or committed, newest first: the latest three, with `+N more` for the rest (eight at most). Each has a kind badge (`TS`, `MD`), the name and folder, and a pill saying how, filled while Claude is at it. A click goes to the file in the tree, a double-click shows it, a right-click copies its path.
- The file you picked for Claude is one slim line under the search box: `Claude sees notes.md trail-demo/deep ✕ History Open Copy path Full path`.
- The tree under the session's working folder, laid out after claude-code-filetree: a blue `■` before each folder and a `·` before each file (the desktop has no Nerd Font icons), dotfiles dimmed, the selected row filled. Folders open on a click and are read as they open; `.git` is hidden. The header names the folder, then the branch, its upstream dimmed, and the repo's changes at the right (`+3 -1 ?:2 M:1`, or `clean`).
- Git status: the name tinted (yellow for modified or renamed, green for added or untracked, red for deleted or conflicted) and, at the right edge, `+N -N` and one letter (`M`, `A`, `U` for untracked, `D`, `R`, `C` for a conflict). A file git has no change for shows when it last changed instead (`2026-10-02 09:24`, grey), and gives that up first in a narrow pane. Rows are set in the monospace face, so these line up in a column, and the colours are filetree's softer palette rather than the theme's. The branch shows commits ahead (↑) and behind (↓). Outside a repo git is asked once and the header says so; a `git init` or `git clone` Claude runs makes it ask again.
- A folder sums the lines changed inside it and counts its changes by kind at the right edge: `?:n` new, `M:n` changed, `D:n` deleted. A folder untracked as a whole gets `U`.
- `●N` at the right of a file counts the edits Claude made to it that went through; a closed folder shows `●` when a file inside it was edited.
- When Claude reads a file (Read) the row lights violet with `· reading`; when Claude changes it (Edit, Write, MultiEdit, NotebookEdit) it lights orange with `· writing`, once the change has gone through. While lit, a bright band sweeps across the name letter by letter, as if it were being typed. The file Claude is on stays lit until it moves to another file or the turn ends (5 minutes at most), and the last file Claude touched keeps a `◂` until another file is touched. The tree opens down to the file and glides to it under the card, which stays on screen; every other open folder that does not lead to it folds, so the tree shows where Claude is. A folder you opened or closed yourself in the last 30 seconds is left as you set it, with the folders above it, since you may be browsing it. The tree is drawn to fit under the card and moves a page with a press on `▲ N above` / `▼ N below` (the desktop scrolls a pane itself, card and all, so the wheel is left out of the Files tree); after a press the follow waits 30 seconds, and a file Claude touches meanwhile shows `Following paused ⌖ Back to Claude` above the tree. The tree goes back to Claude's file when you press it, or when the 30 seconds run out. A search (Grep, Glob) with a folder lights that folder if it is on show, without opening anything.
- Bash is read for the files it touches, from the command's words only: a file a reader names (`cat`, `head`, `tail`, `less`, `wc`, `bat`, `Get-Content` and the like) lights and is followed like a Read; a path a search or listing names (`rg`, `grep`, `find`, `ls`, `fd`, `Select-String`) lights without opening anything. A command with a word built at run time (`$VAR`, backticks) is skipped, and so is anything after a `cd`. After a `git commit` goes through, the files it committed light green with `· committed`. A search's or a commit's light lasts 5 seconds.
- The card keeps the last three git actions Claude ran through Bash (commit, push, pull, fetch, checkout, switch, merge, rebase, stash, and `gh pr create`, `merge`, `checkout`): `… pushing origin main` shimmering while it runs, then `✓ pushed origin main`, a red `✗ push failed`, or a dim `⊘ push denied`. An action run in another folder (after a `cd`, or with git's `-C`) names it, as in `✓ committed · filetrail`, so another repo's commit is not taken for this project's. They stay until newer ones push them out; the card shows the latest as a chip, with `N more` beside it to list the others.
- The search box finds files by name across the project (git's file list in a repo, a walk of the folders otherwise, skipping `node_modules` and the like): names that start with the text first, then names that contain it, then paths. The results replace the tree; picking one opens the tree to it, selected. ✕ goes back to the tree.
- Selecting a file shows `Claude sees: <file>` under the header: every prompt you send then carries one line naming the file, so "this file" means it, until ✕ clears the selection. Beside it: History (N) opens its history, Open opens it in the machine's default app, and Copy path and Copy full path put its path from the project root, or whole, on the clipboard.
- `@path` in a prompt that names a file of the project opens the tree to it and selects it.
- Double-click a file to show it in the pane in place of the tree: Markdown rendered as Claude's replies are, code highlighted with line numbers, 400 lines a page with `◀ ▶` for a longer file. `← files` goes back to the tree as you left it, `↗` (or Open) opens it in its default app. A binary file or one over 2 MB is not shown. When Claude edits the file on show, it is read again. A folder only opens and closes on a double-click. Right-click a row to copy its path from the project root, or with shift held its whole path.
- Buttons beside the folder name: `↻` lists the open folders and reads git again, `◉`/`○` shows or hides dotfiles, `⊟` closes every folder, and `⌖` (with a file selected) opens the tree back to it. Hovering an icon says what it does, beside the icons (a desktop button has no tooltip of its own).
- In a narrow pane a row never wraps: the name is cut with `…` first, then the counts after it give way; the `· reading` word always stays.

### History

- A timeline of the turns that changed files, newest first, under a header for each day (`TODAY`, `YESTERDAY`, `OCT 14`): the time in blue, the first line of the prompt, and what changed: the files' names (or how many, past two), the edits and the lines (`+N` green, `-N` red). Edits that were refused or failed are counted as not applied, in yellow.
- Files git ignores (a notes file kept out of the repo, a build output) are left out of the timeline and of a turn's steps, and a turn that touched only those is hidden; the header says how many (`16 turns · 9 hidden (git-ignored files)`). Such a file's own history, from Files, still shows whole.
- After a turn that changed files, a line above the prompt offers it: `▶ filetrail: 5 edits in 3 files [Replay]`. Replay (or `r` once the band has the keys) opens that turn in History on its first edit, with the keyboard on the pane, so Enter steps forward and Escape closes it. The offer goes once it is replayed or you send the next prompt; the turn stays in History. It sits under whatever other mods draw there.
- While Claude works, the turn in progress sits at the top of the timeline as **Now**, shimmering orange, growing with each edit; an edit whose tool has not answered yet shows `running…`. When the turn ends it becomes an ordinary saved turn, and a view left open on it stays on it.
- Open a turn to step through its edits one diff at a time: a strip of numbered cells, Prev and Next, the file, the tool, the line where the change starts, `+N -N`, and a diff with line numbers. Refused and failed edits are marked. A diff longer than 20 lines folds there with a Show all button; moving to another edit folds it again.
- The layout follows the pane's width. Diff lines wrap rather than being cut, keeping their indentation. Below about 56 columns a path shows its file name first with the folder dimmed after it, and titles take up to two lines. From about 100 columns History splits in two: the turn list on the left and, on the right, the turn picked there (the latest until you pick one).
- Only files inside the project folder are recorded; an edit elsewhere (a temporary file, a config file in your home folder) is left out.
- Click a file name to see that file's edits across every turn. Show in Files takes you to it in the tree; View file (`v`) shows the file in the pane at the page holding the edited line, as it is now.
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
| `v` | View the edit's file in the pane, at its line |
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
