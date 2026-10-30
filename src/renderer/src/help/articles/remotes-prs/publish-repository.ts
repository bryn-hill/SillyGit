import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/publish-repository',
  title: 'Clone from your accounts and publish repositories',
  category: 'remotes-prs',
  summary: 'Pick a repository to clone from your signed-in accounts, or put a local one on GitHub, GitLab, Bitbucket or Azure DevOps.',
  keywords: [
    'clone',
    'publish',
    'create repository',
    'new repository',
    'remote',
    'origin',
    'github',
    'gitlab',
    'bitbucket',
    'azure devops',
    'gitea',
    'private',
    'organization',
    'workspace'
  ],
  related: ['getting-started/open-a-repository', 'integrations/accounts', 'remotes-prs/push-pull-fetch'],
  body: `Once you've added an account in **Settings > Accounts**, SillyGit can list the repositories it can reach and create new ones for you.

## Clone from your accounts

Open **Actions > Clone repository…**, or click **Clone Repository** when no repository is open. The dialog lists the repositories of every signed-in GitHub, GitLab, Bitbucket, Azure DevOps and Gitea account, most recently changed first.

- Type in the search box to narrow the list by name or description. With more than one account, the account menu shows just one of them.
- Click a repository to fill in its URL, or double-click it to clone straight away. You can still paste any URL instead.
- Clones go over HTTPS with the account's token. Tick **Clone over SSH** to use your SSH key instead.
- **Choose folder…** asks where to put it, then opens the clone in a new tab.

If an account's token has expired, the dialog says so under the list; the other accounts still show.

## Publish a repository

A repository with no remote shows **Publish** where **Push** usually is (also **Actions > Publish repository…**). It creates the repository on your host, adds it as \`origin\` and pushes the checked-out branch, set to track it.

- **Account** and **Owner** pick where it goes: yourself or an organization on GitHub and Gitea, a namespace or group on GitLab, a workspace on Bitbucket, or a project on Azure DevOps.
- **Name** starts as the folder's name. Letters, numbers, dots, dashes and underscores work everywhere.
- **Private** is on by default. Azure DevOps doesn't ask, because its projects decide who can see their repositories.

You need at least one commit first. If the repository is created but the push fails, \`origin\` is kept, so fix the problem and click **Push**.

## Example

You started a side project with **Open repository** and made a few commits. Click **Publish**, pick your GitHub account, leave **Private** ticked and click **Publish repository**. A minute later the repository is on GitHub and **Push** and **Pull** work as usual.`
}

export default article
