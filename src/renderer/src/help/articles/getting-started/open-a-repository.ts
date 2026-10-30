import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/open-a-repository',
  title: 'Open, clone and switch repositories',
  category: 'getting-started',
  summary: 'Open repositories in tabs, clone new ones, pin favourites and come back to where you left off.',
  keywords: ['open', 'clone', 'tabs', 'repository', 'repo', 'recent', 'pin', 'session', 'restore', 'folder'],
  related: ['remotes-prs/publish-repository', 'getting-started/welcome', 'getting-started/the-window', 'getting-started/keyboard-shortcuts'],
  body: `Each repository opens in its own tab in the strip at the very top of the window. SillyGit remembers your open tabs, which one was active and your panel layout, and puts them all back the next time you launch it.

## Opening and cloning

- **Open a repository:** click the folder button or **+** in the tab bar, or press **Cmd+O** / **Cmd+T**. Pick any folder inside a Git repository.
- **Clone:** **Actions > Clone repository…** (or **Clone Repository** when nothing is open) takes a URL, or lets you search the repositories of your signed-in accounts. It then asks for the folder to clone into and opens the result in a new tab. See [Clone from your accounts and publish repositories](help:remotes-prs/publish-repository).
- **Recent repositories:** the repository name in the top bar opens a list of recent repos; it replaces the current tab. **Actions > Open recent repository** does the same from the keyboard.

## Working with tabs

- Click a tab to switch; its graph, selection and status come back instantly.
- Drag tabs to reorder them. Right-click a tab to **pin** it, close it, close the others or copy its path. Pinned tabs sit on the left with no close button.
- Middle-click or click **×** to close a tab.
- The **Launchpad** tab shows pull requests and issues across all your open repositories. See [Launchpad](help:remotes-prs/launchpad).

## Shortcuts

| Keys | What it does |
| --- | --- |
| Cmd+O, Cmd+T | Open a repository in a new tab |
| Ctrl+Tab, Ctrl+Shift+Tab | Next or previous tab |
| Cmd+Shift+[ and ] | Previous or next tab |
| Cmd+1 to Cmd+8 | Go to that tab; Cmd+9 goes to the last |

## Example

You work on an API and a web app at the same time. Open both with **Cmd+T**, right-click each tab and choose **Pin**. Tomorrow both are open again when SillyGit starts, and **Cmd+1** / **Cmd+2** jump between them.`
}

export default article
