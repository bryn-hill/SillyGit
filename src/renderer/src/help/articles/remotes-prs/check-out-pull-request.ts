import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/check-out-pull-request',
  title: 'Check out a pull request locally',
  category: 'remotes-prs',
  summary: 'Get a pull request\'s branch on your machine to run and test it, including from forks.',
  keywords: ['checkout pr', 'pull request branch', 'fork', 'test pr', 'run pr'],
  related: ['remotes-prs/review-pull-requests', 'settings/run-button'],
  body: `To try someone's changes on your machine, click **Check out** on the pull request's card in Launchpad, the button in its review screen, or **Check out pull request…** in the palette.

SillyGit fetches the pull request's head and creates a local branch named after it. If it comes from a fork, the branch is named after the fork's owner. If you already have the branch, SillyGit switches to it and fast-forwards it; if your copy has diverged it's left alone. If the pull request belongs to another repository you have open, that tab opens.

## Example

A pull request fixes a layout bug and you want to see it running. Click **Check out** on its card, then click **Run** in the toolbar. When you're done, double-click your own branch to go back to it.

Want to keep working while it runs? The Run button can run any commit in an isolated copy instead; see [Run your project](help:settings/run-button).`
}

export default article
