import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/reset-revert-cherry-pick',
  title: 'Reset, revert and cherry-pick',
  category: 'rebase-history',
  summary: 'Move a branch to another commit, undo a commit with a new one, or copy commits between branches.',
  keywords: ['reset', 'soft', 'mixed', 'hard', 'revert', 'cherry-pick', 'copy commit', 'patch'],
  related: ['rebase-history/undo-and-redo', 'graph/drag-and-drop', 'graph/commit-details'],
  body: `All three are on a commit's right-click menu.

## Reset <branch> to this commit

Moves your branch back (or forward) to the commit. Choose how to treat the changes in between:

- **Soft — keep all changes:** they stay staged.
- **Mixed — keep working copy, reset index:** they stay as unstaged changes.
- **Hard — discard all changes:** they're gone, along with any uncommitted work. SillyGit asks first.

## Revert commit

Makes a new commit that undoes the chosen one. It's the safe way to back out something that's already pushed, because it doesn't rewrite history.

## Cherry-pick commit

Copies the commit onto the branch you have checked out. Select several commits first to cherry-pick them all, or drag them onto a branch.

**Create patch from commit…** saves a commit as a \`.patch\` file; **Actions > Apply patch…** applies one.

## Example

A change you merged last week is causing errors in production. Right-click its commit, choose **Revert commit**, and push. The fix is out without rewriting anyone's history, and you can re-apply it later.`
}

export default article
