import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/drag-and-drop',
  title: 'Drag and drop branches and commits',
  category: 'graph',
  summary: 'Drag a branch onto another to merge, rebase or fast-forward, or drag commits to cherry-pick them.',
  keywords: ['drag', 'drop', 'merge', 'rebase', 'cherry-pick', 'fast-forward', 'branch'],
  related: ['branches/branch-menu', 'rebase-history/reset-revert-cherry-pick'],
  body: `You can drag any branch pill, remote branch, sidebar branch or graph commit and drop it on a **local branch**. When you let go, a menu asks what to do; nothing happens until you pick.

| You drag | Onto | You can |
| --- | --- | --- |
| a branch | another branch | merge it in, rebase onto it, or fast-forward |
| one or more commits | a branch | cherry-pick them onto it |

Next to **Merge** is **Merge … with…**, to always make a merge commit, fast-forward only, or squash the branch into one commit. See [Merge options](help:branches/branch-menu).

SillyGit checks the target branch out first, and refuses if you have uncommitted changes to tracked files or another operation is in progress. Press **Esc** while dragging to cancel. Near the top or bottom of the graph the list scrolls for you.

## Example

\`feature/search\` is ready. Drag its pill in the graph onto the \`main\` pill and choose **Merge feature/search into main**. SillyGit checks out \`main\`, merges, and the new merge commit animates into the graph. Change your mind? Press **Cmd+Z**.`
}

export default article
