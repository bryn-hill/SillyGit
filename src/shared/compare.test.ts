import { describe, expect, it } from 'vitest'
import { compareLabel, parseLeftRightLog } from './compare'

const US = '\x1f'
const line = (mark: string, hash: string, subject: string): string =>
  [mark, hash, 'Ada', 'ada@example.com', '2026-10-30T10:00:00Z', subject].join(US)

describe('parseLeftRightLog', () => {
  it('sorts commits by the side git marked them with', () => {
    const out = [line('>', 'b1', 'feature work'), line('<', 'a1', 'hotfix'), line('>', 'b2', 'more feature'), ''].join('\n')
    const { onlyFrom, onlyTo } = parseLeftRightLog(out)
    expect(onlyFrom.map((c) => c.hash)).toEqual(['a1'])
    expect(onlyTo.map((c) => c.subject)).toEqual(['feature work', 'more feature'])
    expect(onlyTo[0]).toMatchObject({ author: 'Ada', authorEmail: 'ada@example.com' })
  })

  it('reads nothing from empty output', () => {
    expect(parseLeftRightLog('')).toEqual({ onlyFrom: [], onlyTo: [] })
  })
})

describe('compareLabel', () => {
  it('shortens full SHAs and keeps branch names', () => {
    expect(compareLabel('0123456789abcdef0123456789abcdef01234567')).toBe('0123456')
    expect(compareLabel('feature/login')).toBe('feature/login')
  })
})
