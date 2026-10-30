import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/stacked-branches',
  title: 'Stack branches and restack them',
  category: 'branches',
  summary: 'Build branches on top of each other, then restack the whole stack in one click when the bottom changes.',
  keywords: ['stack', 'stacked', 'restack', 'dependent branches', 'parent', 'force with lease'],
  related: ['branches/branch-menu', 'rebase-history/interactive-rebase', 'remotes-prs/create-pull-request'],
  body: `A stack is a chain of branches where each builds on the one below, so you can review a big change as several small pull requests.

## Making a stack

- Right-click a branch and choose **New branch stacked on <name>…**, or use the palette.
- To stack an existing branch, right-click it and choose **Stack <name> on…**.
- **Start work** on an issue can stack the new branch on the current one.

Stacks appear in a **STACKS** group in the sidebar.

## Restacking

When a lower branch changes (you fix review comments, or pull \`main\`), the branches above need rebasing. Click **Restack** in the sidebar or right-click a branch. SillyGit rebases each branch onto its parent from the bottom up, then returns you to the branch you were on. Uncommitted changes are set aside while it works. If a rebase hits conflicts, resolve them and restack again to carry on.

**Push the stack (force with lease)** pushes every branch in it. Deleting a branch in the middle reattaches the branches above it to its parent.

## Example

You build \`api\` off \`main\`, then \`ui\` stacked on \`api\`, then \`tests\` stacked on \`ui\`, and open three small pull requests. Review asks for a change in \`api\`. Commit it on \`api\`, click **Restack**, then **Push the stack**: \`ui\` and \`tests\` now include the fix.`
}

export default article
