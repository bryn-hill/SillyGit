import type { HelpArticle, HelpCategory } from '../../../shared/help/types'
import { HELP_CATEGORIES } from './categories'

export interface HelpSearchHit {
  article: HelpArticle
  score: number
}

// How much a word found in each field counts. Titles matter most, the body least.
const WEIGHTS = { title: 10, keywords: 6, summary: 4, body: 1 }

/** Lower-cased text with Markdown punctuation turned into spaces, so `**Push**` matches "push". */
function plain(text: string): string {
  return text.toLowerCase().replace(/[`*_#>[\]()|~]/g, ' ')
}

/**
 * Full-text search over the articles' titles, summaries, keywords and bodies.
 * Every word of the query must appear somewhere in an article (as a prefix of a
 * word, so "conf" finds "conflict"); hits are ranked by where the words were
 * found. An empty query finds nothing.
 */
export function searchHelp(articles: HelpArticle[], query: string): HelpSearchHit[] {
  const words = plain(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: HelpSearchHit[] = []
  for (const article of articles) {
    const fields = {
      title: plain(article.title),
      keywords: plain(article.keywords.join(' ')),
      summary: plain(article.summary),
      body: plain(article.body)
    }
    let score = 0
    let matchedAll = true
    for (const word of words) {
      const pattern = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      let best = 0
      for (const field of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
        if (pattern.test(fields[field])) best = Math.max(best, WEIGHTS[field])
      }
      if (best === 0) {
        matchedAll = false
        break
      }
      score += best
    }
    if (!matchedAll) continue
    // The whole query as a phrase in the title is the best match of all.
    if (fields.title.includes(words.join(' '))) score += 20
    hits.push({ article, score })
  }
  // Sorting is stable, so equal scores keep the articles' own order, which puts overviews first.
  return hits.sort((a, b) => b.score - a.score)
}

/** Hits grouped by category in the help centre's category order, best hit first within each group. */
export function groupByCategory(hits: HelpSearchHit[]): { category: HelpCategory; label: string; hits: HelpSearchHit[] }[] {
  return HELP_CATEGORIES.map(({ id, label }) => ({ category: id, label, hits: hits.filter((h) => h.article.category === id) }))
    .filter((group) => group.hits.length > 0)
    .sort((a, b) => b.hits[0].score - a.hits[0].score)
}
