import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/launchpad',
  title: 'See your pull requests and issues in Launchpad',
  category: 'remotes-prs',
  summary: 'One place for your open pull requests, issues assigned to you, Jira issues and Azure Boards work items.',
  keywords: ['launchpad', 'pull requests', 'prs', 'issues', 'dashboard', 'review', 'workspace', 'merge pr', 'merge method'],
  related: [
    'remotes-prs/review-pull-requests',
    'remotes-prs/check-out-pull-request',
    'integrations/start-work',
    'integrations/accounts'
  ],
  body: `Click the **Launchpad** tab at the left of the tab bar. It gathers pull requests from every repository you have open, sorted into groups such as **Needs my review**, **Ready to merge**, **Changes requested**, **Failing CI**, **Has conflicts** and **Waiting for review**.

Each card shows the title, branch, author, checks and size. From a card you can:

- click it to **review** the pull request inside SillyGit;
- **Check out** its branch locally;
- **Merge…** it, on your own pull requests that are ready to merge;
- open it on GitHub or Azure DevOps.

**Merge…** asks how: **Create a merge commit**, **Squash and merge** or **Rebase and merge**. Only the methods the repository allows can be picked: on GitHub these come from the repository's settings, and on Azure DevOps from the branch's merge strategy policy. SillyGit starts on the method you used last in that repository. If it can't read the settings, every method is offered and the host refuses any it doesn't allow.

Below the pull requests are **Assigned issues** from GitHub, **Jira issues** and Azure Boards work items, each with a **Start work** button. Click **Refresh** to load everything again.

Launchpad works with GitHub (through an account in Settings, or the \`gh\` CLI signed in with \`gh auth login\`) and Azure DevOps.

## Example

Monday morning: open Launchpad. Two pull requests sit under **Needs my review**. Click the first to read and approve it, then click **Start work** on the issue assigned to you to get a branch for it.`
}

export default article
