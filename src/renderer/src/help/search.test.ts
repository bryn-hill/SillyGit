import { describe, expect, it } from 'vitest'
import type { HelpArticle } from '../../../shared/help/types'
import { HELP_ARTICLES } from './articles'
import { groupByCategory, searchHelp } from './search'

const article = (id: string, fields: Partial<HelpArticle>): HelpArticle => ({
  id,
  category: id.split('/')[0] as HelpArticle['category'],
  title: '',
  summary: '',
  body: '',
  keywords: [],
  ...fields
})

const fixtures = [
  article('commits/stash', { title: 'Stash changes', summary: 'Set work aside', body: 'Click **Stash**.' }),
  article('branches/create', { title: 'Create branches', keywords: ['checkout'], body: 'You can stash first.' }),
  article('conflicts/resolve', { title: 'Resolve conflicts', summary: 'When a stash pop conflicts', body: 'Use the merge tool.' })
]

describe('searchHelp', () => {
  it('finds nothing for an empty query', () => {
    expect(searchHelp(fixtures, '  ')).toEqual([])
  })

  it('ranks title matches above summary and body matches', () => {
    expect(searchHelp(fixtures, 'stash').map((h) => h.article.id)).toEqual([
      'commits/stash',
      'conflicts/resolve',
      'branches/create'
    ])
  })

  it('needs every word, matched as the start of a word', () => {
    expect(searchHelp(fixtures, 'merge tool').map((h) => h.article.id)).toEqual(['conflicts/resolve'])
    expect(searchHelp(fixtures, 'conf').map((h) => h.article.id)).toEqual(['conflicts/resolve'])
    expect(searchHelp(fixtures, 'onflict')).toEqual([])
    expect(searchHelp(fixtures, 'stash checkout').map((h) => h.article.id)).toEqual(['branches/create'])
  })

  it('searches keywords, ignores case and Markdown, and escapes regex characters', () => {
    expect(searchHelp(fixtures, 'CHECKOUT').map((h) => h.article.id)).toEqual(['branches/create'])
    expect(searchHelp(fixtures, '**stash**').length).toBe(3)
    expect(() => searchHelp(fixtures, 'a(b')).not.toThrow()
  })

  it('groups hits by category, best group first', () => {
    const groups = groupByCategory(searchHelp(fixtures, 'stash'))
    expect(groups.map((g) => g.category)).toEqual(['commits', 'conflicts', 'branches'])
    expect(groups[0].label).toBe('Staging and committing')
  })

  it('finds the real articles people are likely to look for', () => {
    const top = (query: string): string | undefined => searchHelp(HELP_ARTICLES, query)[0]?.article.id
    expect(top('keyboard shortcuts')).toBe('getting-started/keyboard-shortcuts')
    expect(top('merge conflict')).toBe('conflicts/resolve-conflicts')
    expect(top('squash')).toBe('rebase-history/interactive-rebase')
    expect(top('undo')).toBe('rebase-history/undo-and-redo')
    expect(top('lanes')).toBe('lanes/lanes-overview')
  })
})
