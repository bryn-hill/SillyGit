import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'integrations/jira',
  title: 'Use Jira with SillyGit',
  category: 'integrations',
  summary: 'See your Jira issues, start work on them, and get links from issue keys in commits and branches.',
  keywords: ['jira', 'atlassian', 'issue', 'ticket', 'key', 'start work', 'data center'],
  related: ['integrations/start-work', 'integrations/accounts', 'remotes-prs/launchpad'],
  body: `Add a **Jira** account in **Settings > Accounts**: Jira Cloud (\`*.atlassian.net\`) takes your email and an API token, Jira Data Center takes a personal access token.

Once it's added:

- Launchpad lists **Jira issues** assigned to you that aren't done.
- **Start work** on one creates a branch named after the key, such as \`PROJ-123-fix-login\`, and remembers the issue for that branch.
- Pull requests from that branch get "PROJ-123: title" and a link back to the issue.
- Jira keys in commit messages become links, and the branch menu has **Open PROJ-123 in Jira** and **Copy link for PROJ-123**.

Only keys from your Jira projects are linked, so things like \`UTF-8\` aren't mistaken for issues.

## Example

PROJ-481 is assigned to you. In Launchpad, click **Start work** on it. You're now on \`PROJ-481-export-csv\`; commit, then **Start a pull request**: the title is already "PROJ-481: Export CSV" and the description links to the issue.`
}

export default article
