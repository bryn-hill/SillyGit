import { describe, expect, it } from 'vitest'
import { laneFilePatch, laneNameProblem, ownerRecords, parseChanges, resolveOwners, type ChangeLine } from './lanes'

const DIFF = `diff --git a/a.txt b/a.txt
index 1111111..2222222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,4 @@
 one
-two
+TWO
 three
 four
@@ -10,3 +10,4 @@ ten
 ten
 eleven
+eleven and a half
 twelve
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+new
diff --git a/pic.png b/pic.png
index 4444444..5555555 100644
Binary files a/pic.png and b/pic.png differ
`

const lanes = (...names: string[]): Set<string> => new Set(names)
const line = (path: string, kind: '+' | '-', pos: number, text: string): ChangeLine => ({
  path,
  kind,
  file: 0,
  hunk: 0,
  index: 0,
  text,
  hash: text,
  pos,
  line: pos
})

describe('parseChanges', () => {
  it('reads changed lines with their positions, and whole files that can’t be split', () => {
    const { files, lines } = parseChanges(DIFF)
    expect(files.map((f) => [f.path, f.status, f.whole])).toEqual([
      ['a.txt', 'M', false],
      ['new.txt', 'A', true],
      ['pic.png', 'M', true]
    ])
    expect(lines.map((l) => [l.path, l.kind, l.line, l.pos, l.hunk, l.index])).toEqual([
      ['a.txt', '-', 2, 2, 0, 1],
      ['a.txt', '+', 2, 2, 0, 2],
      ['a.txt', '+', 12, 12, 1, 2],
      ['new.txt', 'file', 0, 0, -1, -1],
      ['pic.png', 'file', 0, 0, -1, -1]
    ])
  })
})

describe('resolveOwners', () => {
  it('keeps remembered owners, pairing repeated lines in order', () => {
    const lines = [line('f', '+', 3, '}'), line('f', '+', 40, '}')]
    const records = [
      { path: 'f', kind: '+' as const, hash: '}', pos: 1, lane: 'a' },
      { path: 'f', kind: '+' as const, hash: '}', pos: 30, lane: 'b' }
    ]
    expect(resolveOwners(lines, records, { lanes: lanes('a', 'b'), fallback: 'a' })).toEqual(['a', 'b'])
  })

  it('gives new lines to a neighbour within a few lines, through a run of them', () => {
    const lines = [line('f', '+', 10, 'owned'), line('f', '+', 11, 'new 1'), line('f', '+', 12, 'new 2'), line('f', '+', 30, 'far')]
    const records = [{ path: 'f', kind: '+' as const, hash: 'owned', pos: 10, lane: 'b' }]
    expect(resolveOwners(lines, records, { lanes: lanes('a', 'b'), fallback: 'a' })).toEqual(['b', 'b', 'b', 'a'])
  })

  it('sends a file only one lane has committed to that lane, before the default', () => {
    const lines = [line('f', '+', 10, 'x'), line('g', '+', 1, 'y')]
    const fileLanes = new Map([['f', 'b']])
    expect(resolveOwners(lines, [], { lanes: lanes('a', 'b'), fallback: 'a', fileLanes })).toEqual(['b', 'a'])
  })

  it('ignores records of lanes that aren’t applied, and can send unknown lines to one lane', () => {
    const lines = [line('f', '+', 1, 'x'), line('f', '+', 2, 'y')]
    const records = [{ path: 'f', kind: '+' as const, hash: 'x', pos: 1, lane: 'gone' }]
    expect(resolveOwners(lines, records, { lanes: lanes('a'), fallback: 'a' })).toEqual(['a', 'a'])
    const kept = [{ path: 'f', kind: '+' as const, hash: 'x', pos: 1, lane: 'a' }]
    expect(resolveOwners(lines, kept, { lanes: lanes('a', 'b'), fallback: 'a', unmatchedLane: 'b' })).toEqual(['a', 'b'])
  })

  it('round-trips through the records it makes', () => {
    const { lines } = parseChanges(DIFF)
    const owners = ['x', 'x', 'y', 'y', 'x']
    expect(resolveOwners(lines, ownerRecords(lines, owners), { lanes: lanes('x', 'y'), fallback: 'x' })).toEqual(owners)
  })
})

describe('laneFilePatch', () => {
  it('cuts each hunk down to the lane’s lines', () => {
    const { files } = parseChanges(DIFF)
    const patch = laneFilePatch(files[0], new Map([[1, new Set([2])]]), false)
    expect(patch).toBe(
      ['diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt', '@@ -10,3 +10,4 @@ ten', ' ten', ' eleven', '+eleven and a half', ' twelve', ''].join('\n')
    )
    expect(laneFilePatch(files[0], new Map(), false)).toBeNull()
  })
})

describe('laneNameProblem', () => {
  it('accepts branch names and refuses the rest', () => {
    expect(laneNameProblem('fix/login-page')).toBeNull()
    expect(laneNameProblem('')).toMatch(/name/)
    expect(laneNameProblem('has space')).toMatch(/spaces/)
    expect(laneNameProblem('sillygit/workspace')).toMatch(/SillyGit/)
    expect(laneNameProblem('a..b')).toMatch(/valid/)
  })
})
