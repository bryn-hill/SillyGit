import { describe, expect, it } from 'vitest'
import { lintCommitMessage } from './commit-msg.mjs'

describe('lintCommitMessage', () => {
  it('accepts conventional headers with and without scope or body', () => {
    expect(lintCommitMessage('feat(graph): add right-click context menu on commit rows')).toEqual([])
    expect(lintCommitMessage('chore: bump version to 0.2.0\n')).toEqual([])
    expect(lintCommitMessage('fix(branch-menu)!: drop the old menu\n\nBody text.\n')).toEqual([])
    expect(lintCommitMessage('chore(deps): update dependency @vitejs/plugin-react to v6')).toEqual([])
  })

  it('exempts merges, reverts and autosquash commits', () => {
    expect(lintCommitMessage('Merge pull request #17 from bryn-hill/claude/x')).toEqual([])
    expect(lintCommitMessage("Merge remote-tracking branch 'origin/main' into x")).toEqual([])
    expect(lintCommitMessage('Revert "feat: thing"')).toEqual([])
    expect(lintCommitMessage('fixup! feat: thing')).toEqual([])
  })

  it('ignores git comment lines', () => {
    expect(lintCommitMessage('# Please enter the commit message\nfix: thing\n# comment')).toEqual([])
  })

  it('rejects free-form, capitalised or unknown-type headers', () => {
    expect(lintCommitMessage('Add renovate.json')).toHaveLength(1)
    expect(lintCommitMessage('feat: Add a thing')).toEqual(['subject must start with a lowercase letter'])
    expect(lintCommitMessage('feature: add a thing')[0]).toMatch(/unknown type/)
    expect(lintCommitMessage('fix: a thing.')).toEqual(['subject must not end with a period'])
    expect(lintCommitMessage('fix(Graph): a thing')).toHaveLength(1)
  })

  it('rejects long headers and a missing blank line before the body', () => {
    expect(lintCommitMessage(`fix: ${'x'.repeat(100)}`)[0]).toMatch(/keep it to 100/)
    expect(lintCommitMessage('fix: a thing\nbody right away')).toEqual(['leave a blank line between the header and the body'])
  })
})
