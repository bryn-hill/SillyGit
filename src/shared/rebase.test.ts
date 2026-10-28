import { describe, expect, it } from 'vitest'
import {
  buildTodo,
  defaultGroupMessage,
  groupSteps,
  isNoop,
  messageFiles,
  validateSteps,
  type RebaseStep
} from './rebase'

const messages: Record<string, string> = { a: 'A\n\nbody a', b: 'B', c: 'C', d: 'D' }
const messageOf = (hash: string): string => messages[hash]

describe('groupSteps', () => {
  it('folds squashes and fixups into the commit before them and leaves drops out', () => {
    const steps: RebaseStep[] = [
      { hash: 'a', action: 'pick' },
      { hash: 'b', action: 'drop' },
      { hash: 'c', action: 'squash' },
      { hash: 'd', action: 'reword' }
    ]
    expect(groupSteps(steps).map((g) => [g.head.hash, g.members.map((m) => m.hash)])).toEqual([
      ['a', ['c']],
      ['d', []]
    ])
  })
})

describe('defaultGroupMessage', () => {
  it('joins the messages of squashes but not fixups', () => {
    const [group] = groupSteps([
      { hash: 'a', action: 'pick' },
      { hash: 'b', action: 'fixup' },
      { hash: 'c', action: 'squash' }
    ])
    expect(defaultGroupMessage(group, messageOf)).toBe('A\n\nbody a\n\nC')
  })
})

describe('validateSteps', () => {
  it('rejects squashing or fixing up the oldest commit that is kept', () => {
    expect(validateSteps([{ hash: 'a', action: 'squash' }], messageOf)).toMatch(/oldest commit can't be squashed/)
    expect(
      validateSteps(
        [
          { hash: 'a', action: 'drop' },
          { hash: 'b', action: 'fixup' }
        ],
        messageOf
      )
    ).toMatch(/fixed up/)
  })

  it('rejects an empty message', () => {
    expect(validateSteps([{ hash: 'a', action: 'reword', message: '  ' }], messageOf)).toMatch(/empty/)
    expect(validateSteps([{ hash: 'a', action: 'reword', message: 'ok' }], messageOf)).toBeNull()
  })
})

describe('isNoop', () => {
  it('is true only when nothing moves and nothing changes', () => {
    const picks: RebaseStep[] = ['a', 'b'].map((hash) => ({ hash, action: 'pick' }))
    expect(isNoop(picks, ['a', 'b'], messageOf)).toBe(true)
    expect(isNoop([picks[1], picks[0]], ['a', 'b'], messageOf)).toBe(false)
    expect(isNoop([picks[0], { hash: 'b', action: 'reword', message: 'B' }], ['a', 'b'], messageOf)).toBe(true)
    expect(isNoop([picks[0], { hash: 'b', action: 'reword', message: 'B2' }], ['a', 'b'], messageOf)).toBe(false)
    expect(isNoop([picks[0], { hash: 'b', action: 'drop' }], ['a', 'b'], messageOf)).toBe(false)
  })
})

describe('buildTodo', () => {
  it('writes one line per step, or noop for none', () => {
    expect(
      buildTodo([
        { hash: 'a', action: 'pick' },
        { hash: 'b', action: 'squash' }
      ])
    ).toBe('pick a\nsquash b\n')
    expect(buildTodo([])).toBe('noop\n')
  })
})

describe('messageFiles', () => {
  it('keys a reword by itself and a squash group by its last step', () => {
    const files = messageFiles(
      [
        { hash: 'a', action: 'reword', message: 'New A' },
        { hash: 'b', action: 'pick' },
        { hash: 'c', action: 'squash' },
        { hash: 'd', action: 'fixup' }
      ],
      messageOf
    )
    expect([...files]).toEqual([
      ['a', 'New A\n'],
      ['d', 'B\n\nC\n']
    ])
  })

  it('needs nothing for picks and fixups', () => {
    expect(
      messageFiles(
        [
          { hash: 'a', action: 'pick' },
          { hash: 'b', action: 'fixup' }
        ],
        messageOf
      ).size
    ).toBe(0)
  })
})
