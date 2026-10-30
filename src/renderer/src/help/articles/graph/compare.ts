import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/compare',
  title: 'Compare two commits or branches',
  category: 'graph',
  summary: 'See every file that differs between two commits or branches, and the commits only one side has.',
  keywords: ['compare', 'difference', 'diff', 'branches', 'commits', 'range', 'ahead', 'behind', 'left-right', 'what changed'],
  related: ['graph/commit-details', 'graph/diffs', 'branches/branch-menu'],
  body: `Comparing shows what changed from one commit or branch to another, in place of the graph:

- **Files changed** lists every file that differs between the two, as \`git diff A B\` would. Click one to read its diff.
- **Only in …** lists the commits each side has that the other doesn't. Click one to close the comparison and select it in the graph.

The header names both sides as **A → B**: the diff is the change from A to B. **⇄ Swap** turns it round. Press **Esc** or **←** to go back to the graph.

## Ways to start

- Select two commits (**Cmd+click** the second) and click **Compare** in the detail panel. The older commit is the starting point.
- Right-click a branch in the side bar or the graph and choose **Compare <current branch> with <branch>**.
- Right-click any other commit and choose **Compare <current branch> with this commit**.

A comparison only reads: nothing changes in your working directory.

## Example

Before merging \`feature/login\` you want to know what it brings in. Right-click it and choose **Compare main with feature/login**. The file list shows the 6 files it changes, **Only in feature/login** shows its 4 commits, and **Only in main** shows 2 commits it hasn't picked up yet, so you rebase it first.`
}

export default article
