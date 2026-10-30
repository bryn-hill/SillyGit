import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/branch-menu',
  title: 'Merge, rebase, rename and delete branches',
  category: 'branches',
  summary: 'Everything in a branch\'s right-click menu, including pulling a branch without checking it out.',
  keywords: ['merge', 'rebase', 'rename', 'delete', 'branch menu', 'pull branch', 'fast-forward', 'worktree', 'copy name'],
  related: [
    'branches/create-and-switch',
    'graph/drag-and-drop',
    'conflicts/resolve-conflicts',
    'remotes-prs/create-pull-request'
  ],
  body: `Right-click a branch in the sidebar or a pill in the graph. What you see depends on the branch, but it includes:

- **Checkout <name>**.
- **Merge <name> into <current>** and **Rebase <current> onto <name>**, where current is the branch you have checked out.
- **Pull <name> (fast-forward)**: brings a branch you're *not* on up to date with its remote, without checking it out. It only fast-forwards; if the branch has diverged it tells you. On the current branch this is plain **Pull**.
- **Start a pull request from <name>…** (or **View pull request #N** when one is open). See [Create a pull request](help:remotes-prs/create-pull-request).
- **Rename <name>…** and **Delete <name>** (or **Delete <name> from remote**). Deleting asks first.
- **Create worktree from <name>…** to check the branch out in a second folder.
- Stack and git-flow actions, when they apply.
- **Add to favourites**, **Copy branch name**, **Copy commit SHA** and a link to the branch on the remote.

The palette has **Merge into <current>**, **Rebase <current> onto**, **Delete branch** and **Rename** too.

If a merge or rebase stops with conflicts, see [Resolve merge conflicts](help:conflicts/resolve-conflicts).

## Example

You're on \`feature/report\` and \`main\` has moved on. Right-click \`main\` in the sidebar and choose **Pull main (fast-forward)** to update it without leaving your branch. Then right-click \`main\` again and choose **Rebase feature/report onto main**.`
}

export default article
