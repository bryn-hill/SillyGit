import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/edit-older-commits',
  title: 'Edit an older commit in place',
  category: 'rebase-history',
  summary: 'Reword, move, squash or uncommit part of an older commit in one step, without opening the rebase editor.',
  keywords: ['reword', 'squash', 'fixup', 'move commit', 'reorder', 'uncommit', 'take out of commit', 'edit commit', 'amend older commit'],
  related: ['rebase-history/interactive-rebase', 'commits/fixup-and-absorb', 'graph/drag-and-drop', 'rebase-history/undo-and-redo'],
  body: `Every commit on the branch you have checked out can be changed in one step. SillyGit replays the commits after it for you, the way an interactive rebase would, and keeps your uncommitted work as it is.

| To | Do this |
| --- | --- |
| Change a message | Right-click the commit, choose **Reword commit message…**, edit it and press **Cmd+Enter** (**Ctrl+Enter** on Windows and Linux) |
| Move a commit | Right-click it and choose **Move commit up (later)** or **Move commit down (earlier)** |
| Squash commits together | Drag a commit (or several selected ones) onto another commit in the graph and choose **Squash … into …** to keep both messages, or **Fix up … with …** to keep only the target's |
| Take a file out of a commit | Select the commit, right-click the file in its file list and choose **Uncommit this file** |
| Take one change out of a commit | Open the commit's file and click **Uncommit Hunk** on the change |

A squashed commit stays where the commit you dropped it on was. A file or hunk you uncommit leaves the commit and shows up in your working changes, ready to commit somewhere else; if that was everything the commit changed, the commit goes away.

These actions only work on a straight line of commits: if there is a merge between the commit and the branch tip, use [interactive rebase](help:rebase-history/interactive-rebase) from a commit after the merge. A change can't be uncommitted when a later commit edited the same lines. If a replayed commit conflicts, resolve it as usual and click **Continue Rebase**.

Rewriting a commit you have already pushed means the next push needs a force push; SillyGit tells you when that's the case. Changed your mind? Press **Cmd+Z** (**Ctrl+Z**).

## Example

You spot a typo in the message of a commit three back. Right-click it, choose **Reword commit message…**, fix the typo and press **Cmd+Enter**. Later you notice that commit also included a debug file. Right-click the file in its file list and choose **Uncommit this file**: the commit no longer has it, and the file is back in your working changes for you to discard.`
}

export default article
