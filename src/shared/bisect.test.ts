import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMS,
  bisectMarks,
  bisectRunScript,
  bisectSummary,
  estimateSteps,
  parseBisectRefs,
  parseTerms,
  summarizeBisect,
  type BisectState
} from './bisect'

const state = (over: Partial<BisectState>): BisectState => ({
  terms: DEFAULT_TERMS,
  startedFrom: 'main',
  bad: null,
  good: [],
  skipped: [],
  current: null,
  currentLabel: null,
  remaining: 0,
  stepsLeft: 0,
  firstBad: null,
  firstBadLabel: null,
  suspects: [],
  ...over
})

describe('parseTerms', () => {
  it("reads BISECT_TERMS, falling back to git's bad and good", () => {
    expect(parseTerms('new\nold')).toEqual({ bad: 'new', good: 'old' })
    expect(parseTerms(null)).toEqual(DEFAULT_TERMS)
    expect(parseTerms('bad')).toEqual(DEFAULT_TERMS)
  })
})

describe('parseBisectRefs', () => {
  it('sorts the refs into bad, good and skipped', () => {
    const refs = [
      'refs/bisect/bad aaa',
      'refs/bisect/good-bbb bbb',
      'refs/bisect/good-ccc ccc',
      'refs/bisect/skip-ddd ddd',
      ''
    ].join('\n')
    expect(parseBisectRefs(refs, DEFAULT_TERMS)).toEqual({ bad: 'aaa', good: ['bbb', 'ccc'], skipped: ['ddd'] })
  })

  it('uses custom terms', () => {
    const refs = 'refs/bisect/new aaa\nrefs/bisect/old-bbb bbb'
    expect(parseBisectRefs(refs, { bad: 'new', good: 'old' })).toEqual({ bad: 'aaa', good: ['bbb'], skipped: [] })
  })
})

describe('estimateSteps', () => {
  it("matches git's estimate of the steps after this one", () => {
    expect(estimateSteps(1)).toBe(0)
    expect(estimateSteps(2)).toBe(0)
    expect(estimateSteps(5)).toBe(1)
    expect(estimateSteps(8)).toBe(2)
    expect(estimateSteps(1000)).toBe(9)
  })
})

describe('summarizeBisect', () => {
  it('waits until there is both a bad and a good commit', () => {
    expect(summarizeBisect({ bad: 'x', good: [], skipped: [], candidates: [] })).toEqual({
      remaining: 0,
      stepsLeft: 0,
      firstBad: null,
      suspects: []
    })
  })

  it('counts the untested commits and the steps left', () => {
    const s = summarizeBisect({ bad: 'e', good: ['a'], skipped: ['c'], candidates: ['e', 'd', 'c', 'b'] })
    expect(s.remaining).toBe(2)
    expect(s.stepsLeft).toBe(2)
    expect(s.firstBad).toBeNull()
  })

  it('finds the first bad commit when only the bad one is left', () => {
    expect(summarizeBisect({ bad: 'e', good: ['d'], skipped: [], candidates: ['e'] }).firstBad).toBe('e')
  })

  it('lists the suspects when only skipped commits are left', () => {
    const s = summarizeBisect({ bad: 'e', good: ['a'], skipped: ['c', 'd'], candidates: ['e', 'd', 'c'] })
    expect(s.firstBad).toBeNull()
    expect(s.suspects).toEqual(['e', 'd', 'c'])
  })
})

describe('bisectMarks', () => {
  it('marks good, bad, skipped and the commit being tested', () => {
    const marks = bisectMarks(state({ bad: 'e', good: ['a'], skipped: ['b'], current: 'c', remaining: 2 }))
    expect(Object.fromEntries(marks)).toEqual({ e: 'bad', a: 'good', b: 'skip', c: 'current' })
  })

  it('marks the first bad commit once found, and nothing as being tested', () => {
    const marks = bisectMarks(state({ bad: 'd', good: ['c'], current: 'c', firstBad: 'd' }))
    expect(Object.fromEntries(marks)).toEqual({ c: 'good', d: 'first-bad' })
  })

  it('marks nothing as being tested until there is a bad and a good commit', () => {
    const marks = bisectMarks(state({ bad: 'e', current: 'e' }))
    expect(Object.fromEntries(marks)).toEqual({ e: 'bad' })
  })

  it('has nothing without a bisect', () => {
    expect(bisectMarks(null).size).toBe(0)
  })
})

describe('bisectSummary', () => {
  it('says what to do next', () => {
    expect(bisectSummary(state({ bad: 'e' }))).toMatch(/now mark a good commit/)
    expect(bisectSummary(state({ good: ['a'] }))).toMatch(/now mark a bad commit/)
    expect(bisectSummary(state({ bad: 'e', good: ['a'], currentLabel: 'c1 Add c', remaining: 3, stepsLeft: 2 }))).toBe(
      'Bisecting: test c1 Add c · 3 commits left, about 2 steps'
    )
    expect(bisectSummary(state({ bad: 'e', good: ['a'], firstBad: 'e', firstBadLabel: 'e1 Break it' }))).toBe(
      'Bisect found the first bad commit: e1 Break it'
    )
    expect(bisectSummary(state({ bad: 'e', good: ['a'], suspects: ['e', 'd'] }))).toMatch(/one of 2/)
  })
})

describe('bisectRunScript', () => {
  it('quotes the command for sh', () => {
    expect(bisectRunScript("grep -q 'ok' out.txt")).toBe(`git bisect run sh -c 'grep -q '\\''ok'\\'' out.txt'`)
  })
})
