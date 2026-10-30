import { describe, expect, it } from 'vitest'
import {
  addCoAuthor,
  filterCandidates,
  hasMessage,
  parseCoAuthors,
  parsePerson,
  parseShortlog,
  removeCoAuthor,
  stripCoAuthors
} from './coAuthors'

const ada = { name: 'Ada Lovelace', email: 'ada@example.com' }
const grace = { name: 'Grace Hopper', email: 'grace@example.com' }

describe('addCoAuthor', () => {
  it('starts a trailer paragraph after the message', () => {
    expect(addCoAuthor('Fix the thing', ada)).toBe('Fix the thing\n\nCo-authored-by: Ada Lovelace <ada@example.com>')
    expect(addCoAuthor('Fix it\n\nBecause.\n', ada)).toBe('Fix it\n\nBecause.\n\nCo-authored-by: Ada Lovelace <ada@example.com>')
  })

  it('joins an existing trailer paragraph', () => {
    const once = addCoAuthor('Fix it', ada)
    expect(addCoAuthor(once, grace)).toBe(
      'Fix it\n\nCo-authored-by: Ada Lovelace <ada@example.com>\nCo-authored-by: Grace Hopper <grace@example.com>'
    )
    expect(addCoAuthor('Fix it\n\nSigned-off-by: Me <me@example.com>', ada)).toBe(
      'Fix it\n\nSigned-off-by: Me <me@example.com>\nCo-authored-by: Ada Lovelace <ada@example.com>'
    )
  })

  it("doesn't take a conventional subject for a trailer", () => {
    expect(addCoAuthor('fix: typo', ada)).toBe('fix: typo\n\nCo-authored-by: Ada Lovelace <ada@example.com>')
  })

  it('credits someone once, whatever the case of their email', () => {
    const once = addCoAuthor('Fix it', ada)
    expect(addCoAuthor(once, { name: 'Ada', email: 'ADA@example.com' })).toBe(once)
  })

  it('leaves room for a subject when there is no message yet', () => {
    const message = addCoAuthor('', ada)
    expect(message).toBe('\n\nCo-authored-by: Ada Lovelace <ada@example.com>')
    expect(hasMessage(message)).toBe(false)
    expect(hasMessage(`Subject${message}`)).toBe(true)
  })
})

describe('parseCoAuthors / stripCoAuthors / removeCoAuthor', () => {
  const message =
    'Fix it\n\nBody text.\n\nCo-authored-by: Ada Lovelace <ada@example.com>\nco-authored-by:   Grace Hopper <grace@example.com>  \nCo-authored-by: Ada again <ADA@example.com>'

  it('reads every co-author once, ignoring case', () => {
    expect(parseCoAuthors(message)).toEqual([ada, grace])
    expect(parseCoAuthors('Fix it\n\nCo-authored-by: no email')).toEqual([])
  })

  it('strips the trailers', () => {
    expect(stripCoAuthors(message)).toBe('Fix it\n\nBody text.')
  })

  it('removes one person and the blank line left behind', () => {
    expect(parseCoAuthors(removeCoAuthor(message, 'grace@example.com'))).toEqual([ada])
    expect(removeCoAuthor(addCoAuthor('Fix it', ada), 'ada@example.com')).toBe('Fix it')
  })
})

describe('parsePerson', () => {
  it('reads Name <email>', () => {
    expect(parsePerson(' Ada Lovelace <ada@example.com> ')).toEqual(ada)
    expect(parsePerson('Ada Lovelace')).toBeNull()
    expect(parsePerson('<ada@example.com>')).toBeNull()
    expect(parsePerson('Ada <not-an-email>')).toBeNull()
  })
})

describe('parseShortlog', () => {
  it('reads counts, merges one email under two names and sorts busiest first', () => {
    const out = [
      '     3\tGrace Hopper <grace@example.com>',
      '    10\tAda Lovelace <ada@example.com>',
      '     1\tada <ADA@example.com>',
      '     2\tNo Email <>',
      ''
    ].join('\n')
    expect(parseShortlog(out)).toEqual([
      { ...ada, commits: 11 },
      { ...grace, commits: 3 }
    ])
  })
})

describe('filterCandidates', () => {
  it('matches name or email, ignoring case', () => {
    expect(filterCandidates([ada, grace], 'HOP')).toEqual([grace])
    expect(filterCandidates([ada, grace], 'ada@')).toEqual([ada])
    expect(filterCandidates([ada, grace], '  ')).toEqual([ada, grace])
  })
})
