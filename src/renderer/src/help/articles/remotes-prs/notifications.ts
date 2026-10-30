import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/notifications',
  title: 'Pull request notifications',
  category: 'remotes-prs',
  summary: 'Desktop notifications when pull requests are opened, reviewed or commented on.',
  keywords: ['notifications', 'alerts', 'desktop', 'review requested', 'approved', 'comments'],
  related: ['remotes-prs/launchpad', 'integrations/accounts', 'settings/settings-overview'],
  body: `SillyGit can tell you when something happens on GitHub pull requests in the repositories you have open:

- a new pull request is opened;
- someone requests your review;
- your pull request is approved, or changes are requested;
- someone comments.

Turn them on and choose which kinds you want in **Settings > Notifications**, along with how often to check and whether to include pull requests you opened yourself. **Send a test notification** checks your system lets them through. Pull requests opened by coding agents under your own account always count as new. If lots arrive at once, they're folded into one summary.

Notifications need a GitHub account in Settings or the \`gh\` CLI signed in.

## Example

You're waiting on an approval before merging. Leave SillyGit running in the background; when your reviewer approves, a notification pops up, and clicking it opens the pull request.`
}

export default article
