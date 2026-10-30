import { describe, expect, it } from 'vitest'
import { parseReflog, reflogKind } from './reflog'

const line = (...fields: string[]): string => fields.join('\x1f')

describe('parseReflog', () => {
  it('reads each entry with its position, time and message split into action and detail', () => {
    const out = [
      line('b'.repeat(40), 'bbbbbbb', 'HEAD@{1730000100}', 'reset: moving to HEAD~1', 'First'),
      line('a'.repeat(40), 'aaaaaaa', 'HEAD@{1730000000}', 'commit (initial): First', 'First'),
      ''
    ].join('\n')
    expect(parseReflog(out, 'HEAD')).toEqual([
      {
        hash: 'b'.repeat(40),
        shortHash: 'bbbbbbb',
        selector: 'HEAD@{0}',
        action: 'reset',
        detail: 'moving to HEAD~1',
        kind: 'reset',
        time: 1730000100,
        subject: 'First'
      },
      {
        hash: 'a'.repeat(40),
        shortHash: 'aaaaaaa',
        selector: 'HEAD@{1}',
        action: 'commit (initial)',
        detail: 'First',
        kind: 'commit',
        time: 1730000000,
        subject: 'First'
      }
    ])
  })

  it('names branch entries by the short branch name', () => {
    const out = line('c'.repeat(40), 'ccccccc', 'feature@{1730000000}', 'branch: Created from HEAD', 'Start')
    expect(parseReflog(out, 'refs/heads/feature')[0]).toMatchObject({
      selector: 'feature@{0}',
      action: 'branch',
      detail: 'Created from HEAD',
      kind: 'branch'
    })
  })

  it('keeps a message without a colon whole', () => {
    const out = line('d'.repeat(40), 'ddddddd', 'HEAD@{1}', 'updated by script', 'x')
    expect(parseReflog(out, 'HEAD')[0]).toMatchObject({ action: 'updated by script', detail: '', kind: 'other' })
  })
})

describe('reflogKind', () => {
  it.each([
    ['commit', 'commit'],
    ['commit (amend)', 'amend'],
    ['commit (merge)', 'merge'],
    ['merge feature', 'merge'],
    ['rebase (finish)', 'rebase'],
    ['pull --rebase', 'pull'],
    ['checkout', 'checkout'],
    ['cherry-pick', 'pick'],
    ['revert', 'pick'],
    ['fetch', 'other']
  ])('%s is %s', (action, kind) => {
    expect(reflogKind(action)).toBe(kind)
  })
})
