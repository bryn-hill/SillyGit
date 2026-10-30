import type { HelpCategory } from '../../../shared/help/types'

/** Every help category in the order the help centre lists them, with its heading. */
export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'graph', label: 'Commit graph and history' },
  { id: 'commits', label: 'Staging and committing' },
  { id: 'branches', label: 'Branches' },
  { id: 'remotes-prs', label: 'Remotes and pull requests' },
  { id: 'conflicts', label: 'Merge conflicts' },
  { id: 'rebase-history', label: 'Rebase and rewriting history' },
  { id: 'lanes', label: 'Lanes' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'ai', label: 'AI and Claude' },
  { id: 'settings', label: 'Settings and customising' }
]

export function categoryLabel(id: HelpCategory): string {
  return HELP_CATEGORIES.find((c) => c.id === id)?.label ?? id
}
