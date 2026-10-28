import { describe, expect, it } from 'vitest'
import {
  buildOutput,
  buildOutputLines,
  dropCustomForChangedPicks,
  conflictHunks,
  isHunkSideTaken,
  isSideTaken,
  parseConflictMarkers,
  setSideTaken,
  splitLines,
  toggleHunkSide,
  toggleLine,
  unresolvedCount,
  type ConflictPicks
} from './conflicts'

const MARKED = [
  'one\n',
  '<<<<<<< main\n',
  'two from main\n',
  '||||||| base\n',
  'two\n',
  '=======\n',
  'two from feature\n',
  'second feature line\n',
  '>>>>>>> feature\n',
  'three\n'
].join('')

describe('splitLines', () => {
  it('keeps terminators and a final unterminated line', () => {
    expect(splitLines('a\nb\r\nc')).toEqual(['a\n', 'b\r\n', 'c'])
    expect(splitLines('')).toEqual([])
  })
})

describe('parseConflictMarkers', () => {
  it('splits common runs and diff3 hunks', () => {
    expect(parseConflictMarkers(MARKED)).toEqual([
      { kind: 'common', lines: ['one\n'] },
      {
        kind: 'conflict',
        id: 0,
        ours: ['two from main\n'],
        base: ['two\n'],
        theirs: ['two from feature\n', 'second feature line\n']
      },
      { kind: 'common', lines: ['three\n'] }
    ])
  })

  it('handles markers without a base section', () => {
    const segments = parseConflictMarkers('<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n')
    expect(conflictHunks(segments)).toEqual([{ kind: 'conflict', id: 0, ours: ['x\n'], base: [], theirs: ['y\n'] }])
  })

  it('treats an unterminated marker as text', () => {
    const text = '<<<<<<< a\nx\n'
    expect(parseConflictMarkers(text)).toEqual([{ kind: 'common', lines: ['<<<<<<< a\n', 'x\n'] }])
  })

  it('does not mistake longer marker-like lines for markers', () => {
    const text = '<<<<<<<< not a marker\n'
    expect(parseConflictMarkers(text)).toEqual([{ kind: 'common', lines: [text] }])
  })
})

describe('picking and building the output', () => {
  const segments = parseConflictMarkers(MARKED)
  const hunk = conflictHunks(segments)[0]

  it('shows the ancestor text for an unresolved hunk', () => {
    expect(unresolvedCount(segments, {})).toBe(1)
    expect(buildOutput(segments, {})).toBe('one\ntwo\nthree\n')
  })

  it('can write conflict markers for unresolved hunks', () => {
    expect(
      buildOutput(segments, {}, { unresolved: 'markers', currentLabel: 'main', incomingLabel: 'feature' })
    ).toBe(
      'one\n<<<<<<< main\ntwo from main\n=======\ntwo from feature\nsecond feature line\n>>>>>>> feature\nthree\n'
    )
  })

  it('takes a whole side with take all, and drops it with untake all', () => {
    const picks = setSideTaken(segments, {}, 'theirs', true)
    expect(isSideTaken(segments, picks, 'theirs')).toBe(true)
    expect(buildOutput(segments, picks)).toBe('one\ntwo from feature\nsecond feature line\nthree\n')
    expect(buildOutput(segments, setSideTaken(segments, picks, 'theirs', false))).toBe('one\ntwo\nthree\n')
  })

  it('adds hunks in the order they are picked', () => {
    let picks: ConflictPicks = toggleHunkSide(hunk, {}, 'theirs')
    picks = toggleHunkSide(hunk, picks, 'ours')
    expect(buildOutput(segments, picks)).toBe('one\ntwo from feature\nsecond feature line\ntwo from main\nthree\n')
    expect(isHunkSideTaken(hunk, picks, 'ours')).toBe(true)
    // Ticking a taken side again removes only that side.
    picks = toggleHunkSide(hunk, picks, 'theirs')
    expect(buildOutput(segments, picks)).toBe('one\ntwo from main\nthree\n')
  })

  it('takes and drops single lines', () => {
    let picks = toggleLine({}, 0, 'theirs', 1)
    picks = toggleLine(picks, 0, 'ours', 0)
    expect(unresolvedCount(segments, picks)).toBe(0)
    expect(buildOutput(segments, picks)).toBe('one\nsecond feature line\ntwo from main\nthree\n')
    picks = toggleLine(picks, 0, 'theirs', 1)
    expect(buildOutput(segments, picks)).toBe('one\ntwo from main\nthree\n')
    expect(isHunkSideTaken(hunk, picks, 'theirs')).toBe(false)
  })

  it('adds a terminator when an unterminated line is followed by more text', () => {
    const s = parseConflictMarkers('<<<<<<< a\nx\n=======\ny\n>>>>>>> b\nz')
    const picks = toggleLine(toggleLine({}, 0, 'ours', 0), 0, 'theirs', 0)
    expect(buildOutput(s, picks)).toBe('x\ny\nz')
  })

  it('keeps CRLF line endings', () => {
    const s = parseConflictMarkers('a\r\n<<<<<<< x\r\nb\r\n=======\r\nc\r\n>>>>>>> y\r\nd\r\n')
    expect(buildOutput(s, setSideTaken(s, {}, 'ours', true))).toBe('a\r\nb\r\nd\r\n')
  })
})

describe('hard conflict shapes', () => {
  it('parses longer markers, so content that looks like a default-size marker stays content', () => {
    const text = [
      '<<<<<<<<< main\n',
      'Title\n',
      '=======\n',
      '||||||||| base\n',
      'Old\n',
      '=========\n',
      '<<<<<<< quoted\n',
      '>>>>>>>>> feature\n'
    ].join('')
    expect(conflictHunks(parseConflictMarkers(text, 9))).toEqual([
      { kind: 'conflict', id: 0, ours: ['Title\n', '=======\n'], base: ['Old\n'], theirs: ['<<<<<<< quoted\n'] }
    ])
  })

  it('writes unresolved hunks with the marker size it is given', () => {
    const s = parseConflictMarkers('<<<<<<<<< a\nx\n=========\ny\n>>>>>>>>> b\n', 9)
    expect(buildOutput(s, {}, { unresolved: 'markers', currentLabel: 'a', incomingLabel: 'b', markerSize: 9 })).toBe(
      '<<<<<<<<< a\nx\n=========\ny\n>>>>>>>>> b\n'
    )
  })

  it('keeps an empty side empty: taking a deletion removes the lines', () => {
    const s = parseConflictMarkers('a\n<<<<<<< x\n||||||| base\nold\n=======\nnew\n>>>>>>> y\nb\n')
    expect(buildOutput(s, toggleHunkSide(conflictHunks(s)[0], {}, 'theirs'))).toBe('a\nnew\nb\n')
    // An empty side can't be "taken", so the hunk stays unresolved.
    expect(isHunkSideTaken(conflictHunks(s)[0], {}, 'ours')).toBe(false)
    expect(unresolvedCount(s, toggleHunkSide(conflictHunks(s)[0], {}, 'ours'))).toBe(1)
  })

  it('a hunk at the very start and one at the very end, with nothing common around them', () => {
    const s = parseConflictMarkers('<<<<<<< x\nA\n=======\nB\n>>>>>>> y\nmid\n<<<<<<< x\nC\n=======\nD\n>>>>>>> y\n')
    expect(s.map((seg) => seg.kind)).toEqual(['conflict', 'common', 'conflict'])
    expect(buildOutput(s, setSideTaken(s, {}, 'theirs', true))).toBe('B\nmid\nD\n')
  })

  it('mixed line endings: every picked line keeps its own terminator', () => {
    const s = parseConflictMarkers('a\r\n<<<<<<< x\r\nb\r\n=======\nc\n>>>>>>> y\r\nd')
    // Each picked line keeps its own terminator; nothing is rewritten.
    expect(buildOutput(s, setSideTaken(s, setSideTaken(s, {}, 'ours', true), 'theirs', true))).toBe('a\r\nb\r\nc\nd')
  })

  it('unicode lines are kept byte for byte, including combining marks and ZWJ sequences', () => {
    const s = parseConflictMarkers('<<<<<<< x\né 👩‍💻\n=======\n🇳🇿 中文\n>>>>>>> y\n')
    expect(buildOutput(s, setSideTaken(s, {}, 'ours', true))).toBe('é 👩‍💻\n')
  })

  it('hundreds of hunks resolve independently', () => {
    const text = Array.from({ length: 300 }, (_, i) => `c${i}\n<<<<<<< x\no${i}\n=======\nt${i}\n>>>>>>> y\n`).join('')
    const s = parseConflictMarkers(text)
    const hunks = conflictHunks(s)
    expect(hunks).toHaveLength(300)
    let picks: ConflictPicks = {}
    for (const h of hunks) picks = toggleHunkSide(h, picks, h.id % 3 === 0 ? 'theirs' : 'ours')
    expect(unresolvedCount(s, picks)).toBe(0)
    const out = buildOutput(s, picks).split('\n')
    expect(out.slice(0, 4)).toEqual(['c0', 't0', 'c1', 'o1'])
    expect(out).toHaveLength(601)
  })
})

describe('custom (AI) resolutions', () => {
  const text = 'a\n<<<<<<< ours\nb1\n||||||| base\nb\n=======\nb2\n>>>>>>> theirs\nc\n<<<<<<< ours\nd1\n||||||| base\nd\n=======\nd2\n>>>>>>> theirs\n'
  const segments = parseConflictMarkers(text)

  it('resolve a hunk, even to nothing, and win over picks', () => {
    const picks = { 0: [{ side: 'ours' as const, index: 0 }] }
    expect(buildOutput(segments, picks, { custom: { 0: ['merged\n'], 1: [] } })).toBe('a\nmerged\nc\n')
    expect(unresolvedCount(segments, {}, { 1: [] })).toBe(1)
  })

  it('proposals show only for display, with header rows that never get terminators', () => {
    const lines = buildOutputLines(segments, {}, { proposals: { 1: ['d!\n'] }, headers: true })
    expect(lines.map((l) => [l.origin, l.text])).toEqual([
      ['common', 'a\n'],
      ['base', 'b\n'],
      ['common', 'c\n'],
      ['proposal-header', ''],
      ['proposal', 'd!\n']
    ])
    // Without proposals passed in (as when saving) the hunk is still unresolved.
    expect(buildOutput(segments, {})).toBe('a\nb\nc\nd\n')
  })

  it('picking lines in a hunk drops its custom resolution', () => {
    const custom = { 0: ['x\n'], 1: ['y\n'] }
    const after = toggleLine({}, 1, 'theirs', 0)
    expect(dropCustomForChangedPicks(custom, {}, after)).toEqual({ 0: ['x\n'] })
  })
})
