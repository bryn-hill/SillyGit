import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/fixup-and-absorb',
  title: 'Fix up earlier commits and absorb changes',
  category: 'commits',
  summary: 'Fold staged changes into an earlier commit, or let Absorb work out which commit each change belongs to.',
  keywords: ['fixup', 'absorb', 'autosquash', 'fix earlier commit', 'rewrite'],
  related: ['rebase-history/interactive-rebase', 'commits/amend-and-co-authors', 'commits/line-staging'],
  body: `Amend only changes the last commit. To fix one further back:

## Fix up a commit

Stage the fix, right-click the commit it belongs to in the graph, and choose **Fix up this commit with staged changes**. SillyGit commits the fix and rebases it into that commit straight away, keeping any other uncommitted changes.

## Absorb

When you have fixes for several commits at once, stage them all and click **Absorb…** in the commit box (or **Actions > Absorb staged changes into earlier commits…**). SillyGit looks at which unpushed commit last touched the lines around each change and shows you where each hunk will go. Confirm, and each change is folded into its commit. Changes it can't place stay staged.

Both rewrite history, so use them on commits you haven't pushed yet. **Undo** puts things back if the result isn't what you wanted.

## Example

You have three unpushed commits: the API, the UI and the tests. Code review spots a typo in the API and a missing import in the UI. Fix both, stage them, click **Absorb…**: it shows the typo going into the API commit and the import into the UI commit. Confirm and push a clean history.`
}

export default article
