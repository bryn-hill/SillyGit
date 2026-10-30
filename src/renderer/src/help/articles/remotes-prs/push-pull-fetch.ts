import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/push-pull-fetch',
  title: 'Push, pull and fetch',
  category: 'remotes-prs',
  summary: 'Share your commits and bring in other people\'s, and choose how pulls combine them.',
  keywords: ['push', 'pull', 'fetch', 'sync', 'remote', 'upstream', 'rebase pull', 'fast-forward only', 'auto fetch'],
  related: ['remotes-prs/launchpad', 'branches/branch-menu', 'conflicts/resolve-conflicts', 'integrations/accounts'],
  body: `- **Fetch** downloads new commits from your remotes but changes none of your branches. SillyGit fetches in the background every few minutes; change or turn that off in **Settings > Fetch in the background**.
- **Pull** fetches, then brings the new commits into your checked-out branch. The badge on the **Pull** button counts how many commits are waiting.
- **Push** sends your commits to the remote. A branch that has never been pushed is pushed and set to track a remote branch of the same name.

## Choosing how to pull

The caret next to **Pull** offers **Fetch** and three pull modes. The one you pick becomes what the **Pull** button does:

| Mode | What happens when both sides have new commits |
| --- | --- |
| Fast-forward if possible | Merges, making a merge commit |
| Fast-forward only | Refuses, so you can decide what to do |
| Rebase | Replays your commits on top of the remote's |

## Signing in

SillyGit uses your normal Git credentials. You can also add an account with a personal access token in **Settings > Accounts**; see [Accounts](help:integrations/accounts).

## Example

You've made two commits and the **Pull** badge shows 3. Set the pull mode to **Rebase**, click **Pull** so your two commits sit on top of the three new ones, then click **Push**.`
}

export default article
