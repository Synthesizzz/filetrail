# filetrail

**See what Claude is doing to your files, as it does it.**

filetrail adds a pane to Claude Code with two tabs:

- **Files**: your project's file tree, with git status and a little Claude crab that shows what Claude is up to right now.
- **History**: every change Claude made, turn by turn, with a diff for each edit, so you can replay a turn or come back to it later.

It is built for the Claude Code desktop app and also works in the terminal.

## Highlights

- **Follows Claude around.** When Claude reads or edits a file, its row lights up and the tree opens to it.
- **A crab that acts it out.** It reads a book, writes with a pencil, cheers a commit, tears up a deleted file, sends an arrow up on a push, joins two branches on a merge, and falls asleep when Claude is idle.
- **Git at a glance.** The branch, ahead/behind counts, changed lines, and the last git commands Claude ran, with GitHub's own icons.
- **Every edit, kept.** A History timeline of each turn's changes, with diffs you can step through, replay or export as Markdown.
- **Deleted files aren't lost.** Files that Claude, or you, delete are recorded with a copy of their text, so you can check them later.

## Install

In a terminal:

```
claude plugin marketplace add Synthesizzz/filetrail
claude plugin install filetrail@filetrail-mods --scope user
```

Or, inside Claude Code:

```
/plugin marketplace add Synthesizzz/filetrail
/plugin install filetrail@filetrail-mods
```

Start a new session, and the pane opens on its own. You can also open it with `/trail`.

Which scope to choose:

| Scope | Where it's turned on |
|---|---|
| `user` | Every project on your machine |
| `project` | One repo, for everyone who works in it (saved in `.claude/settings.json`) |
| `local` | One repo, just for you |

To get a newer version:

```
claude plugin marketplace update filetrail-mods
claude plugin update filetrail@filetrail-mods
```

Then start a new session.

## A quick tour

### The Files tab

At the top is a **card** showing what's happening right now. Roughly:

```
 my-project                              ↻ ◉ ⊟
 [⎇ main ↑1] [+12 -3 M:2] [✓ pushed origin main]
 (crab)  Editing app.ts · src          Editing
 TOUCHED · 4
   TS  app.ts       src                 Edited
   MD  README.md                        Read
```

- **Title bar:** the folder, the toolbar, and chips for the branch (`↑` ahead, `↓` behind), the repo's changes (`+3 -1 ?:2 M:1` or `clean`), and the last git command Claude ran (`N more` lists the older ones).
- **Right now:** the crab, what Claude is doing ("Reading client.test.js · tests"), and a coloured pill: violet reading, orange editing, green committed, red deleted. A push (teal) or merge (purple) takes over the card while it runs and for 5 seconds after. Between actions it says `Idle` and names the last file touched.
- **TOUCHED:** the files Claude read, edited, committed or deleted this session, and any you deleted, newest first. Three are shown, with `+N more` for the rest (eight at most). Click a row to jump to it in the tree, double-click to view it, right-click to copy its path.

Under the card is the **file tree**:

- Folders open on a click. Dotfiles are dimmed and `.git` is hidden.
- Git status colours each name (yellow modified, green new, red deleted). At the right edge are `+N -N` and a letter (`M`, `A`, `U` untracked, `D`, `R`, `C` conflict). A file with no changes shows when it last changed instead.
- Folders add up what changed inside them: `?:n` new, `M:n` changed, `D:n` deleted.
- `●N` counts Claude's edits to a file. A closed folder shows `●` when something inside it was edited.

### Following Claude

- A file Claude **reads** lights violet with `· reading`. A file it **edits** lights orange with `· writing`, with a bright band sweeping across the name as if it were being typed.
- The tree opens down to Claude's file and glides to it. Other folders fold, so you can see where Claude is. A folder you opened or closed yourself in the last 30 seconds is left alone.
- Use `▲ N above` / `▼ N below` to move the tree a page at a time. Following then pauses for 30 seconds, with `⌖ Back to Claude` to jump back.
- Bash commands count too: `cat`, `head`, `Get-Content` and the like are followed like a read. `rg`, `grep`, `ls`, `find` light up the folders they search. After a `git commit`, the committed files light green.

### Git commands

The card keeps the last three git commands Claude ran through Bash (commit, push, pull, fetch, checkout, switch, merge, rebase, stash, and `gh pr create` / `merge` / `checkout`):

- `… pushing origin main` while it runs, then `✓ pushed origin main`, a red `✗ push failed`, or a dim `⊘ push denied`.
- A command run in another folder names it, as in `✓ committed · other-repo`, so it isn't mistaken for this project's.

### Deleted files

- **Deleted by Claude** (`rm`, `del`, `Remove-Item`, `git rm`): filetrail reads the file just before it goes and saves it in that turn's History as a `Delete` step.
- **Deleted by you:** found the next time the folder or git status is read, and saved in a turn of its own, `Deleted outside Claude`. If git tracks the file, its text comes from the last commit. Otherwise the step says `no copy kept`.
- The card lists them as `Deleted` or `Deleted by you`. Click one to open its history.

### Search, select and preview

- **Search** by file name across the project. Names that start with your text come first. Pick a result to open the tree there.
- **Select a file** to hand it to Claude: `Claude sees: notes.md` appears, and every prompt you send carries a line naming it, so "this file" means it. Beside it are History, Open (in your default app), Copy path and Copy full path. `✕` clears it.
- Typing `@path/to/file` in a prompt also opens the tree to that file.
- **Double-click** a file to view it in the pane: Markdown is rendered, code is highlighted with line numbers, 400 lines a page. `← files` goes back. Binary files and files over 2 MB are not shown.
- **Toolbar:** `↻` refresh, `◉`/`○` show or hide dotfiles, `⊟` collapse all, `⌖` back to the selected file. Hover an icon to see what it does.

### The History tab

- A **timeline** of the turns that changed files, newest first, grouped by day (`TODAY`, `YESTERDAY`, `OCT 14`). Each turn shows the time, the first line of your prompt, the files, and `+N -N`. Edits that were refused or failed are counted separately, in yellow.
- While Claude works, the current turn sits on top as **Now**, growing with each edit.
- **Open a turn** to step through its edits one diff at a time: numbered cells, Prev and Next, the file, tool and line, and the diff. Long diffs fold after 20 lines, with Show all.
- **Click a file name** to see its edits across every turn. Show in Files takes you to it in the tree. View file (`v`) shows it at the edited line.
- **Ask Claude** puts the edit (file, turn and diff) into the prompt box, so you can add a question and send it.
- **Replay:** after a turn that changed files, a line above the prompt offers `▶ filetrail: 5 edits in 3 files [Replay]`. It opens that turn, and Enter steps through it.
- **Export** writes the whole history as Markdown to `~/.claude/filetrail/exports/`.
- Files git ignores (like a local notes file) are left out, and the header says how many turns were hidden.
- History is kept across sessions for each project: the last 50 turns, up to 200 diff lines per edit, and 3 MiB in total across all projects (the least recently used project is dropped first).
- On a wide pane (about 100 columns or more), History splits in two: turns on the left, the picked turn on the right.

## Commands

| Command | What it does |
|---|---|
| `/trail` | Open the pane |
| `/trail replay` | Open the latest turn that changed files |
| `/trail export` | Save the history as Markdown and say where |
| `/trail clear` | Say how many turns would be deleted. `/trail clear yes` deletes this project's history (other projects are left alone) |

## Keyboard

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
| `s` | Show all, or fewer, lines of a long diff |
| `c`, Escape | Close the pane (Escape when Replay opened it) |
| `e` | Export (on the timeline) |

In the line above the prompt, `r` presses Replay once that line has the keys (click it, or press ctrl+x tab).

## Good to know

- **It's its own pane.** Mods can't draw into the desktop app's built-in Files panel, so filetrail docks on the right instead.
- **Desktop first.** It works in the terminal, but the terminal layout has had less care.
- **History records the built-in file tools** (Edit, Write, MultiEdit). A file changed by a Bash command isn't in History, except deletions, but the tree and git status catch up when the turn ends.
- **Bash is read from the command's words, not its output.** A command built at run time (`$VAR`, backticks) or anything after a `cd` is skipped, so an unusual command may be missed. A failed git command is one where Bash reported an error.
- **Diffs:** an Edit's diff covers only the replaced text, not the whole file. A Write of a file over 400 lines shows as all removed, then all added.
- **Deletions you make** are noticed only while a session is open, and only in folders on show or for files git tracks. A file that disappears while another appears in the same folder is treated as a rename. Deletions found within 5 seconds after a turn count as Claude's (for commands like `rm *.log` that filetrail can't read).
- **Big folders** show their first 500 entries.
- **The project** is the folder the session started in.

## Development

```
claude plugin validate .
claude plugin test .
tsc -p .
```

`tsc` uses the types Claude Code writes to `.claude-plugin/types/` once it has loaded the mod. That folder is generated and not committed.

To try a change in your installed copy, raise `version` in `.claude-plugin/plugin.json`, run the two update commands from [Install](#install), and start a new session.

## Credits

- `hooks/diff.ts` is adapted from Replay Theater in [claude-code-playground](https://github.com/anthropics/claude-code-playground) (Apache License 2.0). The replay offer, opening a turn with the keyboard on the pane, and folding long diffs follow its design.
- Drawing rows in a surface module, the shimmer, and the git bar's verbs and colours follow [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) by Kurt Buhler (MIT License), whose feature set also inspired the tree.
- The git icons are [Octicons](https://github.com/primer/octicons) by GitHub (MIT License).

See NOTICE for the full notices.

## License

Apache License 2.0. See LICENSE.
