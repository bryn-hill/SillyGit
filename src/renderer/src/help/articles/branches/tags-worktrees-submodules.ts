import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/tags-worktrees-submodules',
  title: 'Tags, worktrees and submodules',
  category: 'branches',
  summary: 'Create and push tags, open extra worktrees, and see submodules from the sidebar.',
  keywords: ['tag', 'annotated tag', 'release', 'worktree', 'submodule', 'sidebar'],
  related: ['graph/commit-details', 'branches/branch-menu'],
  body: `## Tags

Right-click a commit and choose **Create tag here…** or **Create annotated tag here…** (with a message). Tags appear as pills in the graph and under **TAGS** in the sidebar, where you can right-click them to check out, **Push <tag> to remote**, copy the name or delete them (here, or here and on the remote).

## Worktrees

A worktree is a second folder checked out from the same repository, so you can have two branches open at once. Right-click a commit or branch and choose **Create worktree from …**. When a repository has more than one worktree, a **WORKTREES** group appears in the sidebar. Right-click one to **Open in a new tab**, show it in your file manager, or **Remove worktree…**.

## Submodules

If the repository has submodules, a **SUBMODULES** group lists them. Right-click one to **Check out submodule**, **Update to recorded commit** or **Update all submodules**.

## Example

You need to hotfix last week's release while your feature branch is mid-change. Right-click the \`v2.3.0\` tag, choose **Create worktree from this commit…**, then right-click it under **WORKTREES** and choose **Open in a new tab**. Make a branch, fix and commit there without touching your feature work.`
}

export default article
