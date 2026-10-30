import { describe, expect, it } from 'vitest'
import {
  applyConventional,
  cleanTemplate,
  isUntouchedTemplate,
  learnConventional,
  parseConventional,
  parseRecentMessages,
  typeChoices
} from './commitHints'

describe('cleanTemplate', () => {
  it("drops git's comment lines and the blank lines around the rest", () => {
    expect(cleanTemplate('\n# Subject: what changed\nfeat: \n\n# Why?\nRefs: \n\n')).toBe('feat:\n\nRefs:')
  })

  it('is null for a template of only comments', () => {
    expect(cleanTemplate('# nothing\n\n')).toBeNull()
  })

  it('handles Windows line endings', () => {
    expect(cleanTemplate('# c\r\nTicket: \r\n')).toBe('Ticket:')
  })
})

describe('parseConventional', () => {
  it('reads type, scope and breaking marker', () => {
    expect(parseConventional('feat(api)!: drop v1')).toEqual({ type: 'feat', scope: 'api', breaking: true, description: 'drop v1' })
    expect(parseConventional('fix: typo')).toEqual({ type: 'fix', scope: null, breaking: false, description: 'typo' })
  })

  it('is null for other subjects', () => {
    expect(parseConventional('Merge branch main')).toBeNull()
    expect(parseConventional('Fix: capitalised')).toBeNull()
  })
})

describe('applyConventional', () => {
  it('prefixes a plain subject and keeps the body', () => {
    expect(applyConventional('add login\n\nBody', 'feat', 'auth')).toBe('feat(auth): add login\n\nBody')
  })

  it('replaces an existing prefix, keeping a breaking marker', () => {
    expect(applyConventional('fix(ui)!: rename prop', 'refactor', null)).toBe('refactor!: rename prop')
  })

  it('works on an empty message', () => {
    expect(applyConventional('', 'docs', 'readme')).toBe('docs(readme): ')
  })
})

describe('learnConventional', () => {
  it('counts types and scopes, most used first, newest winning ties', () => {
    const learned = learnConventional([
      'fix(ui): a',
      'feat(git): b',
      'feat(ui): c',
      'Plain subject',
      'chore(deps, ci): d',
      ''
    ])
    expect(learned.types).toEqual(['feat', 'fix', 'chore'])
    expect(learned.scopes).toEqual(['ui', 'git', 'deps', 'ci'])
  })

  it('puts learned types ahead of the standard ones, without repeats', () => {
    expect(typeChoices(['wip', 'fix']).slice(0, 4)).toEqual(['wip', 'fix', 'feat', 'docs'])
  })
})

describe('parseRecentMessages', () => {
  it('keeps the newest message per subject and skips fixups and the template', () => {
    const log = ['feat: b\n\nbody\n', 'fixup! feat: b\n', 'Ticket:\n', 'feat: b\n', 'fix: a\n', ''].join('\0')
    expect(parseRecentMessages(log, 'Ticket:')).toEqual(['feat: b\n\nbody', 'fix: a'])
  })

  it('stops at the limit', () => {
    expect(parseRecentMessages('a\0b\0c', null, 2)).toEqual(['a', 'b'])
  })
})

describe('isUntouchedTemplate', () => {
  it('ignores surrounding whitespace', () => {
    expect(isUntouchedTemplate('Ticket:\n', 'Ticket:')).toBe(true)
    expect(isUntouchedTemplate('Ticket: ABC-1', 'Ticket:')).toBe(false)
    expect(isUntouchedTemplate('', null)).toBe(false)
  })
})
