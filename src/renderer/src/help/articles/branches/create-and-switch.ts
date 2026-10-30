import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/create-and-switch',
  title: 'Create and switch branches',
  category: 'branches',
  summary: 'Make a new branch, check out an existing one, and find your way round the branch sidebar.',
  keywords: ['branch', 'create', 'checkout', 'switch', 'new branch', 'sidebar', 'local', 'remote'],
  related: ['branches/branch-menu', 'branches/branch-status-and-cleanup', 'remotes-prs/push-pull-fetch'],
  body: `Branches let you work on something without touching \`main\` until it's ready.

## Creating a branch

- Click **Branch** in the toolbar. It creates a branch at the selected commit (or where you are now) and checks it out.
- Right-click any commit and choose **Create branch here…**.
- **Actions > Create branch…** from the palette.

Uncommitted changes come with you to the new branch.

## Switching branches

- **Double-click** a branch in the sidebar or a branch pill in the graph.
- Right-click it and choose **Checkout <name>**.
- Press **Cmd+K**, type the branch name, and pick **Check out <name>**.
- Use the branch name in the top bar to pick from a list.

Checking out a remote branch such as \`origin/feature/login\` creates a local \`feature/login\` that tracks it.

## The sidebar

The sidebar groups branches into **FAVOURITES**, **LOCAL** and **REMOTE**. Branch names with slashes are shown as folders, so \`feature/login\` sits inside a \`feature\` folder. Each branch shows how far it is ahead and behind its remote, and tags for branches that are stale or deleted on the remote. Hover a branch and click the star to make it a favourite.

## Example

You're starting on a new login page. Make sure \`main\` is checked out and up to date, click **Branch**, type \`feature/login-page\` and press **Enter**. The top bar now shows \`feature/login-page\`, and your next commit goes on it.`
}

export default article
