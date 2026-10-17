// Finding files by name for the Files tab's search box. No engine calls here.

/** Files listed at most when no repo can list them; the rest are left out and said to be. */
export const MAX_INDEX_FILES = 5000
/** Matches shown at most; the count says how many there are. */
export const MAX_HITS = 50
/** Never walked into when listing a folder without git. */
export const SKIP_DIRS = new Set(['.git', 'node_modules'])

/** `git ls-files -z` output: NUL-separated paths, relative to where git ran, forward slashes. */
export function parseLsFiles(out: string): string[] {
  return out.split('\0').filter(Boolean).map(p => p.replace(/\\/g, '/'))
}

/**
 * How well `rel` matches the lower-cased `q`: 0 the file name starts with it,
 * 1 the name contains it, 2 only the path does; null when nothing matches.
 */
export function matchRank(rel: string, q: string): number | null {
  const path = rel.toLowerCase()
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if (path.includes(q)) return 2
  return null
}

/** The best matches for `query`: by rank, then the shorter path, then alphabetically. */
export function findFiles(files: readonly string[], query: string, limit = MAX_HITS): { hits: string[]; total: number } {
  const q = query.trim().toLowerCase().replace(/\\/g, '/')
  if (!q) return { hits: [], total: 0 }
  const ranked: { rel: string; rank: number }[] = []
  for (const rel of files) {
    const rank = matchRank(rel, q)
    if (rank !== null) ranked.push({ rel, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel))
  return { hits: ranked.slice(0, limit).map(r => r.rel), total: ranked.length }
}
