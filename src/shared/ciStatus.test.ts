import { describe, expect, it } from 'vitest'
import { ciState, ciSummary, rerunTargets, type CiCheck } from './ciStatus'

const check = (state: CiCheck['state'], extra: Partial<CiCheck> = {}): CiCheck => ({ name: state, state, ...extra })

describe('ciState', () => {
  it('lets a failure win over running and passing checks', () => {
    expect(ciState([check('success'), check('pending'), check('failure')])).toBe('failure')
    expect(ciState([check('success'), check('pending')])).toBe('pending')
    expect(ciState([check('success'), check('skipped')])).toBe('success')
    expect(ciState([check('skipped'), check('neutral')])).toBe('neutral')
  })
})

describe('ciSummary', () => {
  it('counts what matters most', () => {
    const summary = (checks: CiCheck[]): string => ciSummary({ sha: 'a', state: ciState(checks), checks })
    expect(summary([check('failure'), check('success')])).toBe('1 of 2 checks failed')
    expect(summary([check('pending'), check('success'), check('success')])).toBe('1 of 3 checks running')
    expect(summary([check('success'), check('success')])).toBe('All 2 checks passed')
    expect(summary([check('success')])).toBe('Check passed')
    expect(summary([check('failure')])).toBe('Check failed')
  })
})

describe('rerunTargets', () => {
  it('lists each failed workflow run once and skips checks that pass or cannot be re-run', () => {
    const run = { kind: 'github-workflow-run', id: 5 } as const
    expect(
      rerunTargets([
        check('failure', { rerun: run }),
        check('failure', { rerun: run }),
        check('failure'),
        check('success', { rerun: { kind: 'github-check-run', id: 9 } })
      ])
    ).toEqual([run])
  })
})
