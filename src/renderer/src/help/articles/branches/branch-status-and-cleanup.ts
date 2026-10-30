import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/branch-status-and-cleanup',
  title: 'Branch status, favourites and clean-up',
  category: 'branches',
  summary: 'Ahead and behind counts, stale and deleted-on-remote tags, favourites, and the Clean up branches dialog.',
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
    'merged branches'
  ],
  related: ['branches/create-and-switch', 'branches/branch-menu', 'settings/settings-overview'],
  body: `## Status in the sidebar

Each local branch shows:

- **↑ and ↓ counts**: commits you haven't pushed, and commits on the remote you haven't pulled;
- a **deleted** tag when its remote branch is gone, usually because the pull request merged;
- a **stale** tag, with its age, when nobody has committed to it for a while. Set how long in **Settings > Branches**, or turn stale tags off.

Star a branch (hover it, or right-click **Add to favourites**) to pin it in **FAVOURITES** at the top. Favourites are per repository.

## Clean up branches

Old branches pile up. Open **Clean up branches…** from the banner that appears when there are some, by right-clicking **LOCAL**, or from the palette. The dialog groups:

- **Deleted on remote**, ticked for you;
- **Already merged** into \`main\`, ticked for you; hover one to see where and when it landed, and through which pull request;
- **Stale**, not ticked.

Branches with unpushed commits are flagged. Click **Delete** and a **Restore** banner lets you bring them all back, tips and tracking included, until you quit.

## Example

After a busy sprint you have 30 local branches. Open **Clean up branches…**: 22 are already merged or gone on the remote and ticked. Untick the one you still want, click **Delete**, and the sidebar is down to eight.`
}

export default article
