import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/commit-details',
  title: 'Inspect a commit',
  category: 'graph',
  summary: 'The commit view: message, author, co-authors, signature badge, files and where a merged branch landed.',
  keywords: ['commit', 'details', 'signature', 'verified', 'gpg', 'ssh', 'co-author', 'files', 'patch', 'copy sha'],
  related: ['graph/commit-graph', 'graph/diffs', 'graph/compare', 'commits/amend-and-co-authors'],
  body: `Select a commit in the graph and the detail panel shows:

- the subject and body, with Jira keys turned into links when you've added a Jira account;
- the author, committer and dates, with avatars;
- **co-authors** from \`Co-authored-by:\` trailers;
- a **signature** badge: **Verified**, **Unverified** (signed, but Git can't check the key) or **Unsigned**;
- the files changed, each with its status. Click one for its diff, or right-click for blame, history, open in your editor and more.

Select several commits with **Cmd+click** or **Shift+click** to see them together and act on them at once, for example to cherry-pick them all. With exactly two selected, **Compare** shows every change between them ([Compare two commits or branches](help:graph/compare)).

## From the commit menu

Right-click a commit for **Checkout this commit**, **Create branch here…**, **Create tag here…**, **Cherry-pick commit**, **Revert commit**, **Reset <branch> to this commit**, **Create patch from commit…**, **Create worktree from this commit…**, **Copy commit SHA** and links to the commit on the remote.

## Example

A release broke and you suspect one commit. Click it, check the badge reads **Verified**, then click each changed file to read the diff. Happy it's the culprit, right-click it and choose **Revert commit**.`
}

export default article
