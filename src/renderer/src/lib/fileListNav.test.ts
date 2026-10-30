import { describe, expect, it } from 'vitest'
import { stepRow } from './fileListNav'

describe('stepRow', () => {
  it('moves down and up one row', () => {
    expect(stepRow(1, 4, 'ArrowDown')).toBe(2)
    expect(stepRow(2, 4, 'ArrowUp')).toBe(1)
  })

  it('stops at either end', () => {
    expect(stepRow(3, 4, 'ArrowDown')).toBeNull()
    expect(stepRow(0, 4, 'ArrowUp')).toBeNull()
  })

  it('starts from the first row going down and the last going up', () => {
    expect(stepRow(-1, 4, 'ArrowDown')).toBe(0)
    expect(stepRow(-1, 4, 'ArrowUp')).toBe(3)
  })

  it('does nothing with no rows', () => {
    expect(stepRow(-1, 0, 'ArrowDown')).toBeNull()
  })
})
