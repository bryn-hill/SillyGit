import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'integrations/azure-devops',
  title: 'Use Azure DevOps',
  category: 'integrations',
  summary: 'Pull requests, reviews and Azure Boards work items for repositories hosted on Azure DevOps.',
  keywords: ['azure', 'azure devops', 'ado', 'vsts', 'visualstudio', 'boards', 'work items', 'microsoft'],
  related: ['integrations/accounts', 'remotes-prs/launchpad', 'remotes-prs/review-pull-requests', 'integrations/start-work'],
  body: `When a repository's \`origin\` is on Azure DevOps (\`dev.azure.com\` or \`*.visualstudio.com\`), SillyGit uses the Azure DevOps API for it. Add an **Azure DevOps** account with a personal access token for your organisation in **Settings > Accounts**.

You then get:

- your pull requests in **Launchpad**, with checks from branch policies;
- the review screen, with comments, threads and votes (**Approve** and **Request changes**);
- **Check out** for pull requests from the same repository;
- **Create pull request**, with reviewers and linked work items;
- **Azure Boards** work items assigned to you in Launchpad, with **Start work**.

Azure DevOps Server (on-premises) isn't supported, and pull request notifications are GitHub only for now.

## Example

Your team's repo lives at \`dev.azure.com/contoso/web\`. Add an Azure DevOps account for \`contoso\`, open Launchpad, and click **Start work** on bug 1042 from Boards. Commit your fix and create a pull request: the work item is linked to it automatically.`
}

export default article
