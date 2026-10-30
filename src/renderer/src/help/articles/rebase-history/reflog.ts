import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/reflog',
  title: 'Find lost commits in the reflog',
  category: 'rebase-history',
  summary: 'See everywhere HEAD or a branch has pointed, and get back to any of it.',
  keywords: ['reflog', 'lost commit', 'recover', 'restore', 'reset', 'deleted', 'HEAD@{1}', 'go back', 'history of HEAD'],
  related: ['rebase-history/undo-and-redo', 'rebase-history/reset-revert-cherry-pick', 'branches/create-and-switch'],
  body: `Git keeps a log of every place HEAD and each branch has pointed: every commit, checkout, reset, merge, rebase and amend. It's called the reflog, and it's how you get back commits that no branch shows any more.

Open it with **Actions > Reflog**, or the **Reflog** tab in **Actions > Activity log**. The newest move is at the top. Each row shows its name (\`HEAD@{2}\`), what happened, the commit it pointed at and when.

The picker on the right switches between HEAD and any local branch. HEAD's reflog covers everything you did; a branch's covers only the moves of that branch.

## Getting back to an entry

Click **⋯** on a row, or right-click it:

- **Show in graph** selects the commit in the graph. If no branch or tag reaches it any more, the graph can't show it and the row says so.
- **Create branch here…** puts a new branch on the commit, which brings it back into the graph.
- **Reset … to here** (named after the checked-out branch) moves it to the commit: soft keeps the changes staged, mixed keeps them unstaged, hard throws them away.
- **Copy commit SHA**.

The reflog also lists what you did in a terminal. Entries expire after about 90 days (30 for commits nothing reaches), so don't leave a rescue too long.

## Example

You ran \`git reset --hard HEAD~3\` and lost three commits. Open **Actions > Reflog**: the top row is the reset, and the row under it (\`HEAD@{1}\`) is where you were before. Click **⋯ > Create branch here…**, call it \`rescue\`, and the three commits are back in the graph.`
}

export default article
