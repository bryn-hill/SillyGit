/**
 * Shared contract between the first-use walkthrough (tour) and the help centre.
 * Article ids are `<category>/<slug>`, e.g. `branches/create-and-switch`.
 */

export type HelpCategory =
  | 'getting-started'
  | 'graph'
  | 'commits'
  | 'branches'
  | 'remotes-prs'
  | 'conflicts'
  | 'rebase-history'
  | 'lanes'
  | 'integrations'
  | 'ai'
  | 'settings'

export interface HelpArticle {
  id: string
  title: string
  category: HelpCategory
  summary: string
  /** Markdown. */
  body: string
  keywords: string[]
  /** Ids of related articles. */
  related?: string[]
}

export interface TourStep {
  id: string
  title: string
  /** Markdown. */
  body: string
  /** Value of a `data-tour` attribute on the element to spotlight; no target centres the step. */
  target?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Help article the step's "Learn more" opens. */
  articleId?: string
}

/** Tour state saved in sillygit-settings under `help`. Only the tour writes it. */
export interface HelpSettings {
  tourCompleted: boolean
  tourVersion: number
}
