import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/hide-and-solo-branches',
  title: 'Hide, solo or limit graph branches',
  category: 'graph',
  summary: 'Leave branches out of the graph, show just one, or only the branch you are on.',
  keywords: ['hide branch', 'solo', 'show only', 'current branch only', 'declutter', 'filter branches', 'graph branches'],
  related: ['graph/commit-graph', 'graph/search-and-filter', 'branches/branch-menu'],
  body: `A busy repo can have dozens of branches drawn side by side. You can trim the graph down without deleting anything:

- **Hide a branch:** right-click it in the graph or the side bar and choose **Hide _branch_ in graph**. Hiding a local branch hides its remote copies too (origin/feat with feat). Hide a remote branch on its own from its remote entry.
- **Solo a branch:** choose **Show only _branch_ in graph**. The graph draws that branch and its upstream, and nothing else, even if you're on another branch.
- **Current branch only:** press **Current branch** in the graph header to draw just the checked-out branch and its upstream. Press it again to bring the rest back.

A bar under the graph header says what's left out. Each chip has an **×** that brings it back, and **Show all branches** clears everything at once. In the side bar, hidden branches are dimmed and tagged **hidden**; a soloed one is tagged **solo**. The palette has **Show only one branch in graph**, **Show only the current branch in graph** and **Show all branches in graph**.

Good to know:

- These settings are saved per repo and survive restarts.
- The branch you have checked out is always drawn, so it can't be hidden.
- A commit still shows if a visible branch or tag also contains it; hiding only removes what's unique to that branch.
- Search looks only at the commits the graph is drawing.
- If a soloed branch is deleted, the graph goes back to showing everything.

## Example

You're reviewing a teammate's work and dependabot has thirty branches open. Right-click **feature/checkout** and choose **Show only feature/checkout in graph** to see just that line of work. When you're done, click the **×** on the "Only feature/checkout" chip.`
}

export default article
