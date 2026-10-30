import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES, SHORTCUTS_ARTICLE, getArticle } from '.'
import { HELP_CATEGORIES } from '../categories'
import { TOUR_STEPS } from '../tourSteps'

const ids = HELP_ARTICLES.map((a) => a.id)

describe('help articles', () => {
  it('have unique ids of the form <category>/<slug>', () => {
    expect(new Set(ids).size).toBe(ids.length)
    for (const article of HELP_ARTICLES) {
      expect(article.id).toMatch(/^[a-z-]+\/[a-z0-9-]+$/)
      expect(article.id.split('/')[0]).toBe(article.category)
    }
  })

  it('only relate to and link to articles that exist', () => {
    for (const article of HELP_ARTICLES) {
      for (const related of article.related ?? []) {
        expect(getArticle(related), `${article.id} relates to ${related}`).toBeDefined()
        expect(related).not.toBe(article.id)
      }
      for (const [, target] of article.body.matchAll(/\]\(help:([^)]+)\)/g)) {
        expect(getArticle(target), `${article.id} links to ${target}`).toBeDefined()
      }
    }
  })

  it('cover every category', () => {
    for (const { id } of HELP_CATEGORIES) {
      expect(HELP_ARTICLES.some((a) => a.category === id), id).toBe(true)
    }
  })

  it('each have a title, summary, keywords and a worked example', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.trim(), article.id).not.toBe('')
      expect(article.summary.trim(), article.id).not.toBe('')
      expect(article.keywords.length, article.id).toBeGreaterThan(0)
      expect(article.body, article.id).toMatch(/^## Example$/m)
    }
  })

  it('include every article the walkthrough links to', () => {
    for (const step of TOUR_STEPS) {
      if (step.articleId) expect(getArticle(step.articleId), step.id).toBeDefined()
    }
    expect(getArticle(SHORTCUTS_ARTICLE)).toBeDefined()
  })
})
