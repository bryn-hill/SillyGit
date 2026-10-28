import { describe, expect, it } from 'vitest'
import type { BlameLine } from '../../../shared/types'
import { blameBlocks, blameHeatScale } from './blame'

function line(lineNo: number, hash: string, date = '2026-01-01T00:00:00Z', uncommitted = false): BlameLine {
  return { lineNo, hash, author: 'Ada', authorEmail: 'ada@example.com', date, summary: hash, path: 'a.txt', uncommitted }
}

describe('blameBlocks', () => {
  it('joins neighbouring lines from the same commit', () => {
    const blocks = blameBlocks([line(1, 'a'), line(2, 'a'), line(3, 'b'), line(4, 'a')])
    expect(blocks.map((b) => [b.line.hash, b.start, b.end])).toEqual([
      ['a', 1, 2],
      ['b', 3, 3],
      ['a', 4, 4]
    ])
  })

  it('sorts by line number first', () => {
    const blocks = blameBlocks([line(2, 'a'), line(1, 'a')])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ start: 1, end: 2 })
  })
})

describe('blameHeatScale', () => {
  const lines = [
    line(1, 'old', '2020-01-01T00:00:00Z'),
    line(2, 'mid', '2022-01-01T00:00:00Z'),
    line(3, 'new', '2024-01-01T00:00:00Z'),
    line(4, '0000', '1970-01-01T00:00:00Z', true)
  ]

  it('runs from 0 for the oldest line to 1 for the newest', () => {
    const heat = blameHeatScale(lines)
    expect(heat(lines[0])).toBe(0)
    expect(heat(lines[2])).toBe(1)
    expect(heat(lines[1])).toBeCloseTo(0.5, 1)
  })

  it('treats uncommitted lines as the newest and one-commit files as new', () => {
    expect(blameHeatScale(lines)(lines[3])).toBe(1)
    expect(blameHeatScale([lines[0]])(lines[0])).toBe(1)
  })
})
