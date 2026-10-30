import { describe, expect, it } from 'vitest'
import { fileRowKeyAction, stepRow } from './fileListNav'

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

describe('fileRowKeyAction', () => {
  const press = (key: string, mods: { metaKey?: boolean; shiftKey?: boolean } = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods
  })

  it('stages and discards unstaged files', () => {
    expect(fileRowKeyAction(press('s'), false)).toBe('stage')
    expect(fileRowKeyAction(press('S'), false)).toBe('stage') // Caps Lock
    expect(fileRowKeyAction(press('d'), false)).toBe('discard')
    expect(fileRowKeyAction(press('Delete'), false)).toBe('discard')
    expect(fileRowKeyAction(press('Backspace'), false)).toBe('discard')
    expect(fileRowKeyAction(press('u'), false)).toBeNull()
  })

  it('only unstages staged files', () => {
    expect(fileRowKeyAction(press('u'), true)).toBe('unstage')
    expect(fileRowKeyAction(press('s'), true)).toBeNull()
    expect(fileRowKeyAction(press('d'), true)).toBeNull()
    expect(fileRowKeyAction(press('Backspace'), true)).toBeNull()
  })

  it('leaves modified keys alone', () => {
    expect(fileRowKeyAction(press('s', { metaKey: true }), false)).toBeNull()
    expect(fileRowKeyAction(press('u', { shiftKey: true }), true)).toBeNull()
  })
})
