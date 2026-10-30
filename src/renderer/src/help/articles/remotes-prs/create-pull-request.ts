import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/create-pull-request',
  title: 'Create a pull request',
  category: 'remotes-prs',
  summary: 'Open a pull request from any branch without leaving SillyGit.',
  keywords: ['pull request', 'pr', 'create pr', 'open pr', 'reviewers', 'draft', 'merge request'],
  related: [
    'remotes-prs/review-pull-requests',
    'remotes-prs/launchpad',
    'branches/stacked-branches',
    'integrations/start-work'
  ],
  body: `Right-click a branch and choose **Start a pull request from <name>…**, or use **Create pull request from <branch>…** in the palette.

The dialog fills in:

- **Merge** (the branch with your changes) and **Into** (the branch to merge into, usually \`main\`, or the parent branch in a stack);
- a **Title** and **Description** from your commits, with "Closes #12" or a Jira link when you started work from an issue;
- suggested **Reviewers**.

Tick **Draft** if it's not ready for review. If the branch isn't pushed yet, the button says **Push and create pull request** and pushes it first. Once it's created, Launchpad opens on it.

**Open on GitHub instead** opens the host's own form with the same title and description.

This works for GitHub and Azure DevOps repositories.

## Example

You've finished \`feature/export\`. Right-click it, choose **Start a pull request from feature/export…**, add Sam as a reviewer and click **Push and create pull request**. Launchpad opens on the new pull request so you can check the files look right.`
}

export default article
