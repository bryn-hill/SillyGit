import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/push-pull-fetch',
  title: 'Push, pull and fetch',
  category: 'remotes-prs',
  summary: 'Share your commits and bring in other people\'s, choose how pulls combine them, and force push safely after rewriting history.',
  keywords: ['push', 'pull', 'fetch', 'sync', 'remote', 'upstream', 'rebase pull', 'fast-forward only', 'auto fetch', 'force push', 'force with lease', 'rejected', 'non-fast-forward', 'push to'],
  related: ['remotes-prs/launchpad', 'branches/branch-menu', 'commits/amend-and-co-authors', 'rebase-history/interactive-rebase', 'conflicts/resolve-conflicts', 'integrations/accounts', 'remotes-prs/publish-repository'],
  body: `- **Fetch** downloads new commits from your remotes but changes none of your branches. SillyGit fetches in the background every few minutes; change or turn that off in **Settings > Fetch in the background**.
- **Pull** fetches, then brings the new commits into your checked-out branch. The badge on the **Pull** button counts how many commits are waiting.
- **Push** sends your commits to the remote. A branch that has never been pushed is pushed and set to track a remote branch of the same name. A repository with no remote shows **Publish** instead; see [Clone from your accounts and publish repositories](help:remotes-prs/publish-repository).

## Choosing how to pull

The caret next to **Pull** offers **Fetch** and three pull modes. The one you pick becomes what the **Pull** button does:

| Mode | What happens when both sides have new commits |
| --- | --- |
| Fast-forward if possible | Merges, making a merge commit |
| Fast-forward only | Refuses, so you can decide what to do |
| Rebase | Replays your commits on top of the remote's |

## Force push with lease

After you amend, rebase, fix up or absorb commits you've already pushed, your branch and the remote one have different histories and git refuses a normal push. SillyGit then asks whether to **force push with lease** instead. Choose **Cancel** if someone else pushed and you want their commits: pull first.

A force push replaces the remote branch with yours. "With lease" makes it safe: it stops if anyone pushed to that branch since your branch last caught up with it, so you can't wipe out work you've never seen. If that happens, fetch, rebase onto their commits, and push again.

You can also force push on purpose from the caret next to **Push**, the branch's right-click menu, or the command palette. Each asks you to confirm.

## Pushing somewhere else

**Push to…** (in the same places) lets you pick the remote and the branch name to push to, for example to send your work to a fork or to a branch with a different name. Tick **Force push (with lease)** in that dialog to replace the branch there. A branch that has never been pushed starts tracking the branch you push it to; one that already tracks a branch keeps tracking it.

## Signing in

SillyGit uses your normal Git credentials. You can also add an account with a personal access token in **Settings > Accounts**; see [Accounts](help:integrations/accounts).

## Example

You've made two commits and the **Pull** badge shows 3. Set the pull mode to **Rebase**, click **Pull** so your two commits sit on top of the three new ones, then click **Push**.`
}

export default article
