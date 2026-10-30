import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/interactive-rebase',
  title: 'Rewrite history with interactive rebase',
  category: 'rebase-history',
  summary: 'Reorder, squash, fix up, reword or drop commits by dragging, without a text editor.',
  keywords: ['interactive rebase', 'squash', 'reorder', 'reword', 'drop', 'fixup', 'rebase -i', 'clean history'],
  related: ['rebase-history/edit-older-commits', 'commits/fixup-and-absorb', 'branches/stacked-branches', 'rebase-history/undo-and-redo'],
  body: `Right-click the commit just *below* the ones you want to change and choose **Interactive rebase <branch> to here…**. The editor lists every commit after it, oldest at the top.

For each commit, choose an action from its menu or press its key:

| Action | Key | What it does |
| --- | --- | --- |
| Pick | P | Keep the commit as it is |
| Reword | R | Keep it and edit its message right there |
| Squash | S | Combine it with the commit above and merge their messages |
| Fixup | F | Combine it with the commit above, keeping only that one's message |
| Drop | D | Remove the commit |

Drag commits, or use **Alt+Up** and **Alt+Down**, to reorder them. Click **Start Rebase** to run it (**Reset** puts every row back to pick). No text editor opens at any point. If a step conflicts, resolve it as usual and click **Continue Rebase**.

To change just one commit, the commit menu can do it in one step: see [Edit an older commit in place](help:rebase-history/edit-older-commits).

Only rewrite commits you haven't pushed, or be ready to force push with lease; see [Push, pull and fetch](help:remotes-prs/push-pull-fetch).

## Example

Your branch has "add export", "fix typo", "wip", "add tests". Open the interactive rebase, set "fix typo" and "wip" to **Fixup**, drag "add tests" to the bottom, and start. You end up with two clean commits: "add export" and "add tests".`
}

export default article
