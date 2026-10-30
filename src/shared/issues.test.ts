import { describe, expect, it } from 'vitest'
import { issueBranchName, slugify, withClosingIssue } from './issues'

describe('issueBranchName', () => {
  it('names the branch after the issue number and title', () => {
    expect(issueBranchName(42, 'The export button does nothing on Safari!')).toBe('42-the-export-button-does-nothing-on-safari')
    expect(issueBranchName(7, 'Crash in `useTabs` (macOS)')).toBe('7-crash-in-usetabs-macos')
    expect(issueBranchName(3, 'Café menü')).toBe('3-cafe-menu')
  })

  it('falls back to issue-N for a title with nothing to slug', () => {
    expect(issueBranchName(9, '🔥🔥')).toBe('issue-9')
  })

  it('cuts a long title at a word, within 40 characters', () => {
    const slug = slugify('a'.repeat(12) + ' ' + 'b'.repeat(12) + ' ' + 'c'.repeat(20))
    expect(slug).toBe(`${'a'.repeat(12)}-${'b'.repeat(12)}`)
    expect(slugify('x'.repeat(60))).toHaveLength(40)
  })
})

describe('withClosingIssue', () => {
  it('adds Closes #N after the body', () => {
    expect(withClosingIssue('', 5)).toBe('Closes #5')
    expect(withClosingIssue('## Commits\n\n- a\n', 5)).toBe('## Commits\n\n- a\n\nCloses #5')
  })

  it('leaves a body that already closes the issue alone', () => {
    expect(withClosingIssue('Fixes #5', 5)).toBe('Fixes #5')
    expect(withClosingIssue('resolves  #5.', 5)).toBe('resolves  #5.')
    expect(withClosingIssue('Closes #50', 5)).toBe('Closes #50\n\nCloses #5')
  })
})
