import { describe, expect, it } from 'vitest'
import { clampColumnWidth, fitGraphWidth, graphWidth } from './graphColumns'
import type { GraphRow } from './graphLayout'

function row(lane: number, before: number, after: number): GraphRow {
  return {
    commit: { hash: `h${lane}${before}${after}` } as GraphRow['commit'],
    lane,
    color: '#fff',
    before: Array(before).fill('x'),
    beforeColors: [],
    after: Array(after).fill('x'),
    afterColors: [],
    incomingLanes: [],
    mergeParentLanes: []
  }
}

describe('fitGraphWidth', () => {
  it('fits the widest row', () => {
    expect(fitGraphWidth([row(0, 1, 1), row(2, 3, 2), row(0, 1, 1)])).toBe(graphWidth(3))
  })

  it('is one lane wide for an empty or linear history', () => {
    expect(fitGraphWidth([])).toBe(graphWidth(1))
    expect(fitGraphWidth([row(0, 1, 1)])).toBe(graphWidth(1))
  })

  it('stops at ten lanes', () => {
    expect(fitGraphWidth([row(30, 31, 31)])).toBe(graphWidth(10))
  })
})

describe('clampColumnWidth', () => {
  it('keeps a width within the column limits and rounds it', () => {
    expect(clampColumnWidth('author', 10)).toBe(60)
    expect(clampColumnWidth('author', 1000)).toBe(320)
    expect(clampColumnWidth('date', 100.4)).toBe(100)
  })
})
