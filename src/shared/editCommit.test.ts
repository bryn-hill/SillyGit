import { describe, expect, it } from 'vitest'
import { moveSteps, rewordSteps, squashSteps } from './editCommit'

const line = ['a', 'b', 'c', 'd']
const order = (steps: { hash: string; action: string }[]): string[] => steps.map((s) => `${s.action} ${s.hash}`)

describe('rewordSteps', () => {
  it('rewords the one commit and picks the rest', () => {
    expect(rewordSteps(line, 'a', 'New')).toEqual([
      { hash: 'a', action: 'reword', message: 'New' },
      { hash: 'b', action: 'pick' },
      { hash: 'c', action: 'pick' },
      { hash: 'd', action: 'pick' }
    ])
  })
})

describe('moveSteps', () => {
  it('swaps with the newer or older neighbour', () => {
    expect(order(moveSteps(line, 'b', 'up'))).toEqual(['pick a', 'pick c', 'pick b', 'pick d'])
    expect(order(moveSteps(line, 'b', 'down'))).toEqual(['pick b', 'pick a', 'pick c', 'pick d'])
  })

  it('refuses to move past either end', () => {
    expect(() => moveSteps(line, 'd', 'up')).toThrow(/newest/)
    expect(() => moveSteps(line, 'a', 'down')).toThrow(/oldest/)
  })
})

describe('squashSteps', () => {
  it('moves newer commits down to the target', () => {
    expect(order(squashSteps(line, ['d'], 'a', 'squash'))).toEqual(['pick a', 'squash d', 'pick b', 'pick c'])
  })

  it('moves older commits up to the target, keeping their order', () => {
    expect(order(squashSteps(line, ['b', 'a'], 'd', 'fixup'))).toEqual(['pick c', 'pick d', 'fixup a', 'fixup b'])
  })

  it('refuses a commit into itself or one off the line', () => {
    expect(() => squashSteps(line, ['a'], 'a', 'squash')).toThrow(/itself/)
    expect(() => squashSteps(line, ['x'], 'a', 'squash')).toThrow(/current branch/)
  })
})
