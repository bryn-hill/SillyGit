import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'rebase-history/bisect',
  title: 'Find the commit that broke something with bisect',
  category: 'rebase-history',
  summary: 'A guided git bisect: mark commits good or bad, or let a test command decide.',
  keywords: ['bisect', 'regression', 'find bug', 'good', 'bad', 'binary search', 'which commit broke'],
  related: ['graph/commit-details', 'settings/run-button'],
  body: `Bisect finds the commit that introduced a bug by testing commits halfway between a good one and a bad one, halving the search each time.

## Starting

Right-click a commit where the bug happens and choose **Start bisect: this commit is bad**, or one where it doesn't and choose **Start bisect: this commit is good**. Then mark the other end from its menu. A **Bisect** banner shows how many steps are left, and SillyGit checks out the commit to test.

## Testing

Test the checked-out commit, then click **Good**, **Bad** or **Skip** (when you can't test this one). The banner moves you on. When it's narrowed down, the banner names the first bad commit; **Show commit** selects it.

Or let a command decide: **Run a command to decide…** runs your Run command, a custom command or one you type, on every step. Exit code 0 means good, 125 means skip, anything else means bad. **Stop run** halts it.

**Reset** ends the bisect and puts you back where you started.

## Example

The tests pass on last month's \`v2.0\` tag but fail now, 200 commits later. Right-click \`v2.0\`, **Start bisect: this commit is good**, then right-click the newest commit and mark it bad. Click **Run a command to decide…** and type \`npm test\`. About eight steps later the banner names the commit that broke them.`
}

export default article
