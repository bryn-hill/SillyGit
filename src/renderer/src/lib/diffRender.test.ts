import { describe, expect, it } from 'vitest'
import { pairForSplit, renderFileDiff, type RenderedDiffLine } from './diffRender'

const DIFF = [
  'diff --git a/greet.ts b/greet.ts',
  'index 1111111..2222222 100644',
  '--- a/greet.ts',
  '+++ b/greet.ts',
  '@@ -1,4 +1,4 @@',
  ' const a = 1',
  '-const b = 2',
  '-const c = 3',
  '+const b = 20',
  ' const d = 4',
  '@@ -10,2 +10,3 @@ function tail() {',
  ' x()',
  '+y()',
  ' z()',
  '\\ No newline at end of file',
  ''
].join('\n')

describe('renderFileDiff', () => {
  it('numbers both sides of every hunk from its header', () => {
    const hunks = renderFileDiff(DIFF)
    expect(hunks.map((h) => h.header)).toEqual(['@@ -1,4 +1,4 @@', '@@ -10,2 +10,3 @@ function tail() {'])
    expect(hunks[0].lines).toEqual([
      { type: 'context', text: 'const a = 1', oldLine: 1, newLine: 1 },
      { type: 'remove', text: 'const b = 2', oldLine: 2, newLine: null, words: [[10, 11]] },
      { type: 'remove', text: 'const c = 3', oldLine: 3, newLine: null },
      { type: 'add', text: 'const b = 20', oldLine: null, newLine: 2, words: [[10, 12]] },
      { type: 'context', text: 'const d = 4', oldLine: 4, newLine: 3 }
    ])
  })

  it('skips the no-newline marker and the trailing blank line', () => {
    const last = renderFileDiff(DIFF)[1]
    expect(last.lines.map((l) => [l.type, l.text, l.oldLine, l.newLine])).toEqual([
      ['context', 'x()', 10, 10],
      ['add', 'y()', null, 11],
      ['context', 'z()', 11, 12]
    ])
  })

  it('gives hunks ids that stay the same for the same diff', () => {
    const ids = renderFileDiff(DIFF).map((h) => h.id)
    expect(new Set(ids).size).toBe(2)
    expect(renderFileDiff(DIFF).map((h) => h.id)).toEqual(ids)
  })

  it('has no hunks for a binary or mode-only change', () => {
    const binary = [
      'diff --git a/logo.png b/logo.png',
      'index 1111111..2222222 100644',
      'Binary files a/logo.png and b/logo.png differ',
      ''
    ].join('\n')
    expect(renderFileDiff(binary)).toEqual([])
    expect(renderFileDiff('')).toEqual([])
  })

  it('counts from line 1 for a new file', () => {
    const added = ['diff --git a/n.txt b/n.txt', 'new file mode 100644', '--- /dev/null', '+++ b/n.txt', '@@ -0,0 +1,2 @@', '+one', '+two', ''].join('\n')
    expect(renderFileDiff(added)[0].lines).toEqual([
      { type: 'add', text: 'one', oldLine: null, newLine: 1 },
      { type: 'add', text: 'two', oldLine: null, newLine: 2 }
    ])
  })
})

describe('pairForSplit', () => {
  const line = (type: RenderedDiffLine['type'], text: string): RenderedDiffLine => ({
    type,
    text,
    oldLine: type === 'add' ? null : 1,
    newLine: type === 'remove' ? null : 1
  })

  it('puts context on both sides and pairs removals with additions', () => {
    const ctx = line('context', 'same')
    const r1 = line('remove', 'old 1')
    const r2 = line('remove', 'old 2')
    const a1 = line('add', 'new 1')
    expect(pairForSplit([ctx, r1, r2, a1, ctx])).toEqual([
      { left: ctx, right: ctx },
      { left: r1, right: a1 },
      { left: r2, right: null },
      { left: ctx, right: ctx }
    ])
  })

  it('pads a run of additions with blank left cells', () => {
    const a1 = line('add', 'a')
    const a2 = line('add', 'b')
    expect(pairForSplit([a1, a2])).toEqual([
      { left: null, right: a1 },
      { left: null, right: a2 }
    ])
  })

  it("doesn't pair an addition with a removal that comes after it", () => {
    const a = line('add', 'a')
    const r = line('remove', 'r')
    expect(pairForSplit([a, r])).toEqual([
      { left: null, right: a },
      { left: r, right: null }
    ])
  })

  it('is empty for no lines', () => {
    expect(pairForSplit([])).toEqual([])
  })
})
