import { describe, expect, it } from 'vitest'
import {
  buildOutput,
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
