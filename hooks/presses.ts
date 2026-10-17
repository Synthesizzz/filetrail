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

export function clearRows(): void {
  rowPresses.clear()
  rowOpens.clear()
  rowCopies.clear()
}
