import { useMemo, useState, type JSX, type KeyboardEvent, type MouseEvent } from 'react'
import type { HelpArticle } from '../../../shared/help/types'
import Markdown from '../components/claude/Markdown'
import { HELP_ARTICLES, getArticle } from './articles'
import { HELP_CATEGORIES, categoryLabel } from './categories'
import { closeHelp } from './helpCentreStore'
import { groupByCategory, searchHelp } from './search'
import { startTour } from './tourBus'

interface Props {
  /** The article to open on; null opens the home page. */
  initialArticle: string | null
}

/** Links in article bodies written `[text](help:<article id>)` open that article. */
const HELP_LINK = 'help:'

/**
 * The help centre: a searchable window of articles about every feature. Opened
 * with `openHelp()`, the Help menu, F1 or `?`. Keyed on each open, so state
 * starts fresh every time.
 */
export default function HelpCentre({ initialArticle }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  /** Articles opened, oldest first; the last is on show. Empty shows the home page. */
  const [trail, setTrail] = useState<string[]>(() => (initialArticle && getArticle(initialArticle) ? [initialArticle] : []))
  const [active, setActive] = useState(0)

  const searching = query.trim().length > 0
  const hits = useMemo(() => searchHelp(HELP_ARTICLES, query), [query])
  const groups = useMemo(() => groupByCategory(hits), [hits])
  // Results in the order they're listed, for the arrow keys.
  const listed = groups.flatMap((g) => g.hits.map((h) => h.article))
  const article = trail.length > 0 ? getArticle(trail[trail.length - 1]) : undefined

  const show = (id: string): void => {
    if (!getArticle(id)) return
    setTrail((t) => (t[t.length - 1] === id ? t : [...t, id]))
    setQuery('')
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (listed.length > 0) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + listed.length) % listed.length)
    } else if (e.key === 'Enter' && listed[active]) {
      e.preventDefault()
      show(listed[active].id)
    }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    if (searching) setQuery('')
    else closeHelp()
  }

  // Article bodies link to each other with help: URLs; catch those before the
  // Markdown renderer's own handler, which only opens web links.
  const onClickCapture = (e: MouseEvent): void => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href')
    if (href?.startsWith(HELP_LINK)) {
      e.preventDefault()
      e.stopPropagation()
      show(href.slice(HELP_LINK.length))
    }
  }

  return (
    <div className="modal-backdrop help-backdrop" onClick={closeHelp}>
      <div
        className="modal help-centre"
        role="dialog"
        aria-modal="true"
        aria-label="Help centre"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onClickCapture={onClickCapture}
      >
        <div className="modal-header help-header">
          <button
            className="icon-button"
            onClick={() => setTrail((t) => t.slice(0, -1))}
            disabled={trail.length === 0}
            title="Back"
            aria-label="Back"
          >
            ←
          </button>
          <button className="help-home" onClick={() => setTrail([])} title="Help centre home">
            Help centre
          </button>
          <input
            className="help-search"
            type="search"
            placeholder="Search help…"
            aria-label="Search help"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onSearchKeyDown}
          />
          <button className="icon-button" onClick={closeHelp} title="Close (Esc)" aria-label="Close help">
            ✕
          </button>
        </div>
        <div className="help-body">
          <nav className="help-nav" aria-label={searching ? 'Search results' : 'Help topics'}>
            {searching ? (
              groups.length === 0 ? (
                <div className="help-empty">Nothing matches “{query.trim()}”.</div>
              ) : (
                groups.map((group) => (
                  <section key={group.category} className="help-nav-group">
                    <h3>{group.label}</h3>
                    <ul>
                      {group.hits.map(({ article: a }) => (
                        <li key={a.id}>
                          <button
                            className={`help-nav-item ${listed[active]?.id === a.id ? 'active' : ''}`}
                            onClick={() => show(a.id)}
                            data-testid="help-result"
                          >
                            <span className="help-nav-title">{a.title}</span>
                            <span className="help-nav-summary">{a.summary}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )
            ) : (
              HELP_CATEGORIES.map((category) => (
                <section key={category.id} className="help-nav-group">
                  <h3>{category.label}</h3>
                  <ul>
                    {HELP_ARTICLES.filter((a) => a.category === category.id).map((a) => (
                      <li key={a.id}>
                        <button
                          className={`help-nav-item ${article?.id === a.id ? 'active' : ''}`}
                          aria-current={article?.id === a.id ? 'page' : undefined}
                          onClick={() => show(a.id)}
                        >
                          <span className="help-nav-title">{a.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </nav>
          <main className="help-content" aria-label={article ? article.title : 'Help centre home'}>
            {article ? <ArticleView article={article} onOpen={show} /> : <HelpHome onOpen={show} />}
          </main>
        </div>
      </div>
    </div>
  )
}

function ArticleView({ article, onOpen }: { article: HelpArticle; onOpen: (id: string) => void }): JSX.Element {
  const related = (article.related ?? []).map(getArticle).filter((a): a is HelpArticle => !!a)
  return (
    <article className="help-article" data-article={article.id}>
      <div className="help-article-category">{categoryLabel(article.category)}</div>
      <h2>{article.title}</h2>
      <p className="help-article-summary">{article.summary}</p>
      <Markdown text={article.body} />
      {related.length > 0 && (
        <section className="help-related" aria-label="Related articles">
          <h3>Related</h3>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <button className="link-button" onClick={() => onOpen(r.id)}>
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

const POPULAR = [
  'getting-started/welcome',
  'commits/stage-and-commit',
  'branches/create-and-switch',
  'remotes-prs/push-pull-fetch',
  'conflicts/resolve-conflicts',
  'getting-started/keyboard-shortcuts'
]

function HelpHome({ onOpen }: { onOpen: (id: string) => void }): JSX.Element {
  return (
    <div className="help-home-page">
      <h2>How can we help?</h2>
      <p>
        Search above, or pick a topic on the left. Every article ends with a worked example. New to SillyGit? The walkthrough
        shows you round the window in a minute.
      </p>
      <button
        className="help-tour-button"
        onClick={() => {
          closeHelp()
          startTour()
        }}
      >
        Start the walkthrough
      </button>
      <h3>Popular articles</h3>
      <ul className="help-cards">
        {POPULAR.map(getArticle)
          .filter((a): a is HelpArticle => !!a)
          .map((a) => (
            <li key={a.id}>
              <button className="help-card" onClick={() => onOpen(a.id)}>
                <span className="help-card-title">{a.title}</span>
                <span className="help-card-summary">{a.summary}</span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}
