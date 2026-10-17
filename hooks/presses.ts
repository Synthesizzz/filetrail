// What pressing each drawn Client row does, by its key (`row-…` in Files, `turn-…`
// in History). A row's post carries data, not the closure, so the views fill this
// while drawing and the `ui.message` hook looks the key up. The pane clears it
// before each draw, so a row no longer drawn presses nothing.

export const rowPresses = new Map<string, () => void>()
