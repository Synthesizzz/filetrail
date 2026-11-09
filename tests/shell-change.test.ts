import { expect, test } from 'claude-code/testing'

import { changeStep } from '../hooks/history'
import { formatSize, judge, namedFiles, snapshot, MAX_WATCHED } from '../hooks/shell-change'

const ROOT = 'C:\\work\\demo'
const named = (command: string) => namedFiles(command, ROOT).map(f => [f.path, f.truncates])

test('namedFiles: files a command names, redirect targets, and whether a redirect truncates', () => {
  expect(named('python fix.py docs/guide.md')).toEqual([['C:/work/demo/fix.py', false], ['C:/work/demo/docs/guide.md', false]])
  expect(named('echo hi > notes.md')).toEqual([['C:/work/demo/notes.md', true]])
  expect(named('echo hi >> notes.md')).toEqual([['C:/work/demo/notes.md', false]])
  expect(named('echo hi >notes.md')).toEqual([['C:/work/demo/notes.md', true]])
  expect(named('cat a.md b.md | tee out.md')).toEqual([['C:/work/demo/out.md', true]])
  expect(named('cat a.md | tee -a out.md')).toEqual([['C:/work/demo/out.md', false]])
  expect(named('sed -i s/a/b/ src/a.ts')).toEqual([['C:/work/demo/src/a.ts', false]])
})

test('namedFiles: leaves out readers, searches, git, globs, URLs, flags and words built at run time', () => {
  expect(named('cat a.md')).toEqual([])
  expect(named('rg foo src/a.ts')).toEqual([])
  expect(named('git checkout -- src/a.ts')).toEqual([])
  expect(named('rm *.log')).toEqual([])
  expect(named('curl https://example.com/a.json')).toEqual([])
  expect(named('node build.js --out=dist/x.js')).toEqual([['C:/work/demo/build.js', false]])
  expect(named('python "$SCRIPT" notes.md')).toEqual([])
  expect(named('cd sub && python fix.py a.md')).toEqual([])
  expect(named('echo 1.5 3')).toEqual([])
  expect(named('> notes.md')).toEqual([['C:/work/demo/notes.md', true]])
})

test('namedFiles: no more than MAX_WATCHED files, each once', () => {
  const many = Array.from({ length: 30 }, (_, i) => `f${i}.md`).join(' ')
  expect(namedFiles(`python go.py ${many}`, ROOT).length).toBe(MAX_WATCHED)
  expect(named('python go.py go.py')).toEqual([['C:/work/demo/go.py', false]])
})

test('snapshot counts characters and headings', () => {
  expect(snapshot('# A\n\ntext\n## B\n### C\n')).toMatchObject({ size: 21, headings: 3 })
  expect(snapshot('no headings #here\n')).toMatchObject({ headings: 0 })
})

test('snapshot: a `# ` line is a heading only in a Markdown file; in a script it is a comment', () => {
  expect(snapshot('# a\n# b\ncode\n', false).headings).toBe(0)
  // So dropping comments from a script is never flagged as lost headings.
  expect(judge(snapshot('# a\n# b\n# c\n' + 'x'.repeat(300), false), snapshot('x'.repeat(300), false), false)).toBe(null)
})

test('formatSize: short sizes whole, long ones in thousands', () => {
  expect(formatSize(850)).toBe('850')
  expect(formatSize(12_340)).toBe('12.3k')
  expect(formatSize(4_100)).toBe('4.1k')
})

const doc = (headings: number, body: number) => Array.from({ length: headings }, (_, i) => `## Part ${i}\n${'x'.repeat(body)}\n`).join('')

test('judge: a file that shrank by more than half is flagged, with sizes and the percentage', () => {
  const before = snapshot(doc(6, 400))
  const after = snapshot(doc(6, 100))
  const found = judge(before, after, false)
  // 6 parts of 411 characters (2466), then of 111 (666): 73% gone, the headings kept.
  expect(found).toMatchObject({ flag: 'Shrank −73%', note: 'shrank 2.5k → 666 (−73%)' })
})

test('judge: a small shrink, growth, an identical file and a short file are not flagged', () => {
  expect(judge(snapshot(doc(6, 400)), snapshot(doc(6, 300)), false)).toBe(null)
  expect(judge(snapshot(doc(2, 100)), snapshot(doc(4, 100)), false)).toBe(null)
  expect(judge(snapshot('same text here, long enough to count\n'.repeat(10)), snapshot('same text here, long enough to count\n'.repeat(10)), true)).toBe(null)
  expect(judge(snapshot('tiny file\n'), snapshot('t\n'), false)).toBe(null)
})

test('judge: headings that fell to under half are flagged even when the size held', () => {
  const found = judge(snapshot(doc(6, 100)), snapshot(doc(2, 400)), false)
  expect(found?.flag).toBe('Headings 6 → 2')
  expect(found?.note).toContain('## 6 → 2')
})

test('judge: a truncating redirect over a file that changed is flagged as overwritten, grown or not', () => {
  const before = snapshot(doc(3, 100))
  const after = snapshot(doc(3, 120))
  expect(judge(before, after, true)).toMatchObject({ flag: 'Overwritten' })
  expect(judge(before, after, false)).toBe(null)
})

test('changeStep: a Bash step whose diff keeps the old text as removed lines, capped as any step is', () => {
  const old = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n') + '\n'
  const step = changeStep('C:/work/demo/a.md', 'C:/work/demo', old, 'one\n', 'shrank 1k → 0k', 5, 's1')
  expect(step).toMatchObject({ tool: 'Bash', rel: 'a.md', note: 'shrank 1k → 0k', status: 'ok', del: 500, add: 1 })
  expect(step.diff.length).toBe(201)
  expect(step.diff[0]).toEqual({ op: '-', t: 'line 0' })
  expect(step.diff.at(-1)!.t).toMatch(/more lines/)
})
