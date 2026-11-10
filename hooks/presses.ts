// What each drawn Client row does, by its key (`row-…` in Files, `turn-…` in History).
// A row's post carries data, not the closure, so the views fill these while drawing
// and the `ui.message` hook looks the key up. The pane clears them before each draw,
// so a row no longer drawn does nothing.

/** A click (the first of a double-click too). */
export const rowPresses = new Map<string, () => void>()
/** The second click of a double-click: a file opens in its default app; a folder has none. */
export const rowOpens = new Map<string, () => void>()
/** A right-click: the row's path to the clipboard, whole with shift held. */
export const rowCopies = new Map<string, (full: boolean, surface: string) => void>()

/** A click with Ctrl held: the row's file or folder shown in the system's file manager. */
export const rowReveals = new Map<string, () => void>()

/** A toolbar icon's click, by the tool's id. */
export const toolPresses = new Map<string, () => void>()

/** A tab's press in the tree's All | Now switch, by the view it chooses. */
export const modePresses = new Map<string, () => void>()

export function clearRows(): void {
  modePresses.clear()
  toolPresses.clear()
  rowPresses.clear()
  rowOpens.clear()
  rowCopies.clear()
  rowReveals.clear()
}
