// File references in a reply of Claude's: `path:12`, `path:12-20`, `path#L12`, `path#L12-L20`.
// The path must end in a file extension and the line must be there, so a bare file name, a URL, a
// time or a version is not taken for one. Whether the file exists is the caller's to check.
// No engine calls here.

/** References taken from one reply at most. */
export const MAX_REFS = 20

export type Ref = { path: string; line: number; end?: number }

// Not preceded by a path character, a colon or a slash: that would be the tail of a longer name or
// of a URL (`https://host/a.ts:3` is not a reference). The path runs from an optional drive or
// `~/` `./` `../` prefix through folders to a name with an extension that starts with a letter.
const REF = /(?<![\w@.\\/~:-])((?:[A-Za-z]:[\\/]|~?\/|\.{1,2}\/)?(?:[\w@.~-]+[\\/])*[\w@~-][\w@.~-]*\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+)(?:-(\d+))?(?::\d+)?|#L(\d+)(?:-L?(\d+))?)(?!\w)/g

/** The references in `text`, in the order they come, each once, `MAX_REFS` at most. */
export function findRefs(text: string): Ref[] {
  const out: Ref[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(REF)) {
    const line = Number(m[2] ?? m[4])
    if (!(line >= 1)) continue
    const last = Number(m[3] ?? m[5])
    const end = last > line ? last : undefined
    const key = `${m[1]!.toLowerCase()}:${line}:${end ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ path: m[1]!, line, ...(end !== undefined ? { end } : {}) })
    if (out.length >= MAX_REFS) break
  }
  return out
}

/** How a reference reads on its link: the path, then its line or range. */
export function refLabel(ref: Ref): string {
  return `${ref.path}:${ref.line}${ref.end !== undefined ? `-${ref.end}` : ''}`
}
