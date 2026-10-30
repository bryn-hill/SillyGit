import type { Command } from '../components/CommandPalette'
import { HELP_ARTICLES, SHORTCUTS_ARTICLE } from './articles'
import { openHelp } from './helpCentreStore'
import { startTour } from './tourBus'

/** The Help entries in the command palette: the walkthrough and the help centre's articles. */
export function helpCommands(): Command[] {
  return [
    { id: 'help-start-walkthrough', group: 'Help', label: 'Start walkthrough', run: startTour },
    { id: 'help-open', group: 'Help', label: 'Open help centre', shortcut: 'F1', run: () => openHelp() },
    { id: 'help-shortcuts', group: 'Help', label: 'Keyboard shortcuts', run: () => openHelp(SHORTCUTS_ARTICLE) },
    // One list rather than an entry per article keeps the palette's top level short;
    // searching from the top level still finds every article by title.
    {
      id: 'help-articles',
      group: 'Help',
      label: 'Help articles',
      children: HELP_ARTICLES.map((article) => ({
        id: `help-article-${article.id}`,
        group: 'Help',
        label: article.title,
        run: () => openHelp(article.id)
      }))
    }
  ]
}
