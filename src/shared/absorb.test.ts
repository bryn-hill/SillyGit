import { describe, expect, it } from 'vitest'
import { linesToBlame, pickTarget } from './absorb'

describe('linesToBlame', () => {
  it('blames the removed lines', () => {
    expect(linesToBlame('@@ -4,4 +4,4 @@', ' a\n-b\n+B\n c\n-d\n')).toEqual([5, 7])
  })

  it('blames the lines either side of an insertion', () => {
    expect(linesToBlame('@@ -4,3 +4,4 @@', ' a\n b\n+new\n c\n')).toEqual([5, 6])
  })

  it('keeps to lines that exist at the start and end of the file', () => {
    expect(linesToBlame('@@ -1,2 +1,3 @@', '+top\n a\n b\n')).toEqual([1])
    expect(linesToBlame('@@ -1,2 +1,3 @@', ' a\n b\n+end\n')).toEqual([2])
    expect(linesToBlame('@@ -0,0 +1,2 @@', '+x\n+y\n')).toEqual([])
  })
})

describe('pickTarget', () => {
  const c = (hash: string): { hash: string; shortHash: string; subject: string } => ({ hash, shortHash: hash, subject: hash })
  it('takes the newest blamed candidate', () => {
    expect(pickTarget(new Set(['old', 'new', 'pushed']), [c('new'), c('mid'), c('old')])).toBe('new')
    expect(pickTarget(new Set(['pushed']), [c('new')])).toBeNull()
  })
})
