import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'integrations/accounts',
  title: 'Add accounts and tokens',
  category: 'integrations',
  summary: 'Connect GitHub, GitLab, Bitbucket, Gitea, Azure DevOps or Jira with a personal access token.',
  keywords: [
    'account',
    'token',
    'pat',
    'personal access token',
    'github',
    'gitlab',
    'bitbucket',
    'gitea',
    'forgejo',
    'azure devops',
    'sign in',
    'login',
    'credentials',
    'gh cli',
    'avatars'
  ],
  related: ['integrations/jira', 'integrations/azure-devops', 'remotes-prs/launchpad', 'remotes-prs/push-pull-fetch'],
  body: `SillyGit uses your normal Git credentials for fetch, pull and push. Adding an account lets it also talk to your host's API, for Launchpad, pull requests, reviews, notifications and avatars, and pushes over HTTPS with the token.

## Adding one

Open **Settings > Accounts** and click **Add account…**. Pick the provider:

- **GitHub** (including GitHub Enterprise), **GitLab**, **Bitbucket**, **Gitea / Forgejo** and **Azure DevOps** for code;
- **Jira** for issues.

Each one links to the page where you create a personal access token, and says which permissions it needs. SillyGit checks the token, then stores it encrypted with your system's secure storage. Remove an account from the same list.

## Without an account

For GitHub, SillyGit can use the GitHub CLI instead: install \`gh\` and run \`gh auth login\`. Launchpad and pull request features then work through it.

## Example

Your company's code is on GitHub Enterprise at \`github.acme.dev\`. Create a token there with the \`repo\` scope, open **Settings > Accounts > Add account…**, choose GitHub, enter the host and token, and Launchpad starts showing your company's pull requests.`
}

export default article
