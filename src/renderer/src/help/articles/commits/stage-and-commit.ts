import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/stage-and-commit',
  title: 'Stage and commit changes',
  category: 'commits',
  summary: 'See what changed, stage files, write a message and commit.',
  keywords: ['commit', 'stage', 'unstage', 'discard', 'working copy', 'wip', 'message', 'add', 'index'],
  related: [
    'commits/line-staging',
    'commits/amend-and-co-authors',
    'commits/commit-message-help',
    'rebase-history/undo-and-redo'
  ],
  body: `Select **Uncommitted changes**, the top row of the graph. The detail panel lists your **Unstaged** and **Staged** files, with the commit box underneath. The list updates by itself as files change on disk.

## Committing

1. Stage what you want in this commit: click **+** on a file, or **Stage All**. Click **−** or **Unstage All** to take files back out.
2. Click a file to see its diff. You can stage single hunks or lines from there; see [Stage hunks and lines](help:commits/line-staging).
3. Type a commit message: a short summary on the first line, then a blank line and any detail.
4. Click **Commit**, or press **Cmd+Enter**.

Your commit appears at the top of the graph. If you committed too soon, **Undo** in the toolbar (Cmd+Z) puts the changes back, staged.

## Other file actions

- **Discard changes** (the bin icon on an unstaged file) throws away your edits to it. It asks first.
- The pencil opens the file in the built-in editor.
- Right-click a file for more: blame, history, open in your editor, track with LFS, copy the path.

## Example

You fixed a bug in \`login.ts\` and also tidied \`README.md\`. Stage only \`login.ts\`, write \`fix(login): keep the session after a refresh\`, press **Cmd+Enter**. Then stage \`README.md\` and commit it separately with \`docs: tidy the readme\`, so each commit does one thing.`
}

export default article
