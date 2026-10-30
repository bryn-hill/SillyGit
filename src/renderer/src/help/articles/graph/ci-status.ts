import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/ci-status',
  title: 'See CI results on the graph',
  category: 'graph',
  summary: 'A coloured dot beside each pushed commit shows whether its checks passed, failed or are still running.',
  keywords: ['ci', 'checks', 'build', 'pipeline', 'actions', 'status', 'failing', 're-run', 'rerun', 'tests'],
  related: ['graph/commit-graph', 'integrations/accounts', 'integrations/azure-devops', 'remotes-prs/review-pull-requests'],
  body: `For repositories on GitHub or Azure DevOps, the **Branch / Tag** column starts with a dot for each pushed branch tip and the newest commits:

- **Green:** every check passed;
- **Red:** at least one check failed;
- **Yellow, pulsing:** checks are still running;
- **Grey:** checks were skipped or cancelled.

Commits with no checks have no dot. Hover a dot for a count, such as **1 of 4 checks failed**.

## Finding the failing job

Click the dot to list its checks, failures first. Click a check's name to open that job on GitHub or Azure DevOps.

## Re-running failures

When a check failed, the list has **Re-run failed**. On GitHub that re-runs the failed jobs of each workflow run (or asks the app that made the check to run it again); on Azure DevOps it retries the build. The dot turns yellow while they run.

## Where the results come from

- **GitHub:** GitHub Actions and other check runs, plus commit statuses. SillyGit uses your GitHub account from **Settings > Accounts**, or the GitHub CLI (\`gh\`) if you're signed in there.
- **Azure DevOps:** the newest build of each pipeline for the commit, using your Azure DevOps account.

Results are looked at again whenever the graph refreshes, every time a background fetch runs (**Settings > Fetch in the background**), and every 30 seconds while any check is running.

## Example

You push \`fix-login\` and carry on working. A few minutes later its dot turns red. Click it: **test** failed with "Process completed with exit code 1". Click **test** to read the log on GitHub. It was a flaky test, so click **Re-run failed**; the dot pulses yellow, then goes green.`
}

export default article
