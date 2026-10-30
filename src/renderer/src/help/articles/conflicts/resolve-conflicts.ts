import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'conflicts/resolve-conflicts',
  title: 'Resolve merge conflicts',
  category: 'conflicts',
  summary: 'What happens when a merge, rebase, cherry-pick or stash pop conflicts, and how to finish or abort it.',
  keywords: ['conflict', 'merge conflict', 'resolve', 'ours', 'theirs', 'abort', 'continue', 'rebase conflict'],
  related: ['conflicts/merge-tool', 'conflicts/resolve-many-files', 'branches/branch-menu', 'rebase-history/undo-and-redo'],
  body: `A conflict happens when two branches change the same lines and Git can't tell which to keep. It can happen during a merge, rebase, cherry-pick, revert or stash pop.

When it does, the top row of the graph says so and the detail panel shows a **Conflicted files** list above your staged files, with the operation's name.

## Resolving

For each conflicted file, either:

- right-click it and choose **Take current (…)** to keep your side or **Take incoming (…)** to keep theirs, or
- click it (or **Open in merge tool**) to choose chunk by chunk in the [merge tool](help:conflicts/merge-tool).

Resolved files move to **Staged**. You can also edit a file by hand and choose **Mark resolved**.

## Finishing

When no conflicts are left, the commit box changes to **Commit** (merge), **Continue Rebase**, or similar. Click it to finish. During a rebase, SillyGit carries on to the next commit and stops again if that one conflicts too. **Skip Commit** drops a commit that's now empty.

Changed your mind? **Abort** puts everything back as it was before you started.

## Example

You merge \`main\` into \`feature/search\` and \`search.ts\` conflicts. Click it to open the merge tool, take your version of the first chunk and theirs for the second, then **Save**. Back in the panel, click **Commit** to finish the merge.`
}

export default article
