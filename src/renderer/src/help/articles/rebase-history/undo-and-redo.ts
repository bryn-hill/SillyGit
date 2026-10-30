import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/undo-and-redo',
  title: 'Undo and redo',
  category: 'rebase-history',
  summary: 'Take back the last commit, checkout, merge, reset and more with the Undo button.',
  keywords: ['undo', 'redo', 'mistake', 'revert', 'go back', 'cmd+z', 'reflog'],
  related: ['rebase-history/reset-revert-cherry-pick', 'commits/stage-and-commit', 'conflicts/resolve-conflicts'],
  body: `Made a mistake? Click **Undo** in the toolbar or press **Cmd+Z** (when you're not typing in a text box). Hover the button first to see exactly what it will undo, for example "Undo commit "fix login"".

Undo can take back:

- a commit or amend (the changes come back staged);
- a checkout (you're back on the previous branch);
- a merge, cherry-pick, revert, reset, rebase or pull.

**Redo** (Cmd+Shift+Z) does it again, as long as nothing else has moved since.

Undo works from Git's own reflog, so it also covers things you did in a terminal. It won't touch uncommitted changes it would have to throw away; if they're in the way, it tells you.

Other places have their own undo: resolving conflicts shows an **Undo** banner, deleting branches in clean-up shows **Restore**, and Lanes has **Undo lane change**.

## Example

You committed to \`main\` by accident instead of your feature branch. Press **Cmd+Z**: the commit is gone and its changes are staged again. Click **Branch**, name it \`feature/oops\`, and commit there.`
}

export default article
