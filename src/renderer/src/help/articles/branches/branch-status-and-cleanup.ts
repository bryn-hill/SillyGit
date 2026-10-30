import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/branch-status-and-cleanup',
  title: 'Branch status, conflict warnings, favourites and clean-up',
  category: 'branches',
  summary:
    'Ahead and behind counts, stale and deleted-on-remote tags, early merge conflict warnings, favourites, and the Clean up branches dialog.',
  keywords: [
    'stale',
    'gone',
    'deleted on remote',
    'ahead',
    'behind',
    'favourite',
    'star',
    'cleanup',
    'prune',
    'merged branches',
    'conflicts',
    'merge conflict warning',
    'would conflict',
    'merge-tree'
  ],
  related: ['branches/create-and-switch', 'branches/branch-menu', 'conflicts/resolve-conflicts', 'settings/settings-overview'],
  body: `## Status in the sidebar

Each local branch shows:

- **↑ and ↓ counts**: commits you haven't pushed, and commits on the remote you haven't pulled;
- a **deleted** tag when its remote branch is gone, usually because the pull request merged;
- a **stale** tag, with its age, when nobody has committed to it for a while. Set how long in **Settings > Branches**, or turn stale tags off;
- a **conflicts** tag when merging it would stop with conflicts.

## Conflict warnings

SillyGit tries a merge of each local branch in the background, without touching your files, the index or any branch. A branch gets a **conflicts** tag when it would conflict with:

- the default branch (\`origin/main\`, or a local \`main\` or \`master\` when there's no remote), or
- the branch you have checked out.

Hover the tag to see which branch it clashes with and the files involved. The check runs again only when a branch moves, for example after a commit or a fetch, so it stays quick in big repositories. It needs git 2.38 or newer; with older git there are no tags. Turn it off with **Warn about branches that would conflict** in **Settings > Branches**.

The tag is a warning, not a blocker. Merging or rebasing soon, while the clash is small, is usually easier than leaving it.

Star a branch (hover it, or right-click **Add to favourites**) to pin it in **FAVOURITES** at the top. Favourites are per repository.

## Clean up branches

Old branches pile up. Open **Clean up branches…** from the banner that appears when there are some, by right-clicking **LOCAL**, or from the palette. The dialog groups:

- **Deleted on remote**, ticked for you;
- **Already merged** into \`main\`, ticked for you; hover one to see where and when it landed, and through which pull request;
- **Stale**, not ticked.

Branches with unpushed commits are flagged. Click **Delete** and a **Restore** banner lets you bring them all back, tips and tracking included, until you quit.

## Example

Your branch \`checkout-form\` shows **conflicts**. Hovering it says it would conflict with \`origin/main\` in \`src/cart.ts\`: someone changed the same lines there yesterday. Rebase onto \`origin/main\` now and fix the one file, rather than finding out at the pull request.

After a busy sprint you have 30 local branches. Open **Clean up branches…**: 22 are already merged or gone on the remote and ticked. Untick the one you still want, click **Delete**, and the sidebar is down to eight.`
}

export default article
