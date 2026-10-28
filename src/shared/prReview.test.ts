import { describe, expect, it } from 'vitest'
import { checksSummary, reviewProblem, threadsByLine, type PrReviewThread } from './prReview'

const thread = (id: string, path: string, line: number | null, side: 'LEFT' | 'RIGHT' = 'RIGHT'): PrReviewThread => ({
  id,
  path,
  line,
  startLine: null,
  side,
  isResolved: false,
  isOutdated: line == null,
  comments: []
})

describe('reviewProblem', () => {
  const comment = { id: 'd', path: 'a', line: 1, side: 'RIGHT' as const, body: 'x' }

  it('allows a bare approval', () => {
    expect(reviewProblem({ event: 'APPROVE', body: '', comments: [] }, false)).toBeNull()
  })

  it("stops approving or requesting changes on your own pull request", () => {
    expect(reviewProblem({ event: 'APPROVE', body: '', comments: [] }, true)).toMatch(/own pull request/)
    expect(reviewProblem({ event: 'REQUEST_CHANGES', body: 'x', comments: [] }, true)).toMatch(/own pull request/)
    expect(reviewProblem({ event: 'COMMENT', body: 'x', comments: [] }, true)).toBeNull()
  })

  it('needs something to say for a comment or changes request', () => {
    expect(reviewProblem({ event: 'COMMENT', body: ' ', comments: [] }, false)).not.toBeNull()
    expect(reviewProblem({ event: 'REQUEST_CHANGES', body: '', comments: [] }, false)).not.toBeNull()
    expect(reviewProblem({ event: 'REQUEST_CHANGES', body: '', comments: [comment] }, false)).toBeNull()
    expect(reviewProblem({ event: 'COMMENT', body: '', comments: [comment] }, false)).toBeNull()
  })

  it('refuses an empty line comment', () => {
    expect(reviewProblem({ event: 'APPROVE', body: '', comments: [{ ...comment, body: ' ' }] }, false)).toMatch(/empty/)
  })
})

describe('threadsByLine', () => {
  it('groups a file’s threads by side and line, with outdated ones apart', () => {
    const { byLine, outdated } = threadsByLine(
      [thread('a', 'x.ts', 3), thread('b', 'x.ts', 3), thread('c', 'x.ts', 3, 'LEFT'), thread('d', 'x.ts', null), thread('e', 'y.ts', 3)],
      'x.ts'
    )
    expect(byLine.get('RIGHT:3')?.map((t) => t.id)).toEqual(['a', 'b'])
    expect(byLine.get('LEFT:3')?.map((t) => t.id)).toEqual(['c'])
    expect(outdated.map((t) => t.id)).toEqual(['d'])
  })
})

describe('checksSummary', () => {
  it('summarises failing, pending and passing checks', () => {
    expect(checksSummary([])).toEqual({ state: 'neutral', text: 'No checks' })
    expect(checksSummary([{ name: 'a', state: 'success' }, { name: 'b', state: 'success' }])).toEqual({
      state: 'success',
      text: 'All 2 checks passed'
    })
    expect(checksSummary([{ name: 'a', state: 'success' }, { name: 'b', state: 'pending' }]).state).toBe('pending')
    expect(
      checksSummary([
        { name: 'a', state: 'failure' },
        { name: 'b', state: 'pending' },
        { name: 'c', state: 'success' }
      ])
    ).toEqual({ state: 'failure', text: '1 failing, 1 passed, 1 pending' })
  })
})
