import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'integrations/start-work',
  title: 'Start work on an issue',
  category: 'integrations',
  summary: 'Turn a GitHub issue, Jira ticket or Azure Boards work item into a branch in one click.',
  keywords: ['start work', 'issue', 'branch from issue', 'closes', 'ticket', 'work item', 'assigned'],
  related: ['remotes-prs/launchpad', 'integrations/jira', 'integrations/azure-devops', 'remotes-prs/create-pull-request'],
  body: `In Launchpad, every issue assigned to you has a **Start work** button. It opens a small dialog with:

- the **Repository** to work in, when it can't tell;
- a **Branch name** made from the issue, like \`42-fix-login-redirect\` or \`PROJ-42-fix-login-redirect\`, which you can change;
- **Stack on <branch>**, to build on the branch you're on instead of the default branch.

SillyGit creates the branch from the latest default branch (or stacks it), checks it out and remembers which issue it's for. If the branch already exists, it simply checks it out.

When you later create a pull request from the branch, its description links the issue: "Closes #42" on GitHub, a Jira link, or a linked Azure Boards work item.

## Example

Issue #42, "Login redirect loops", is assigned to you. Click **Start work** and accept \`42-login-redirect-loops\`. Fix it, commit, and **Start a pull request**: the description already says "Closes #42", so merging it closes the issue.`
}

export default article
