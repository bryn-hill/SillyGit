import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/review-pull-requests',
  title: 'Review pull requests',
  category: 'remotes-prs',
  summary: 'Read the conversation and changed files, leave line comments, and approve or request changes.',
  keywords: ['review', 'approve', 'request changes', 'comment', 'line comment', 'conversation', 'files changed', 'checks'],
  related: ['remotes-prs/launchpad', 'remotes-prs/check-out-pull-request', 'ai/ai-review'],
  body: `Click a pull request in Launchpad to open the review screen. It has two tabs:

- **Conversation:** the description, checks, reviews and comments. Reply to a thread, resolve it, or add a comment.
- **Files changed:** every changed file as a diff. Click **+** in the gutter to comment on a line; **Shift+click** to comment on a range.

Line comments are kept as **Pending** drafts until you send your review. At the bottom, write an optional summary, pick **Comment**, **Approve** or **Request changes**, and click **Submit review**. On your own pull request you can only comment.

The header has **Check out** to try the branch locally.

## Example

A teammate's pull request needs your review. Open it, read the description, switch to **Files changed** and leave two line comments. Back at the bottom, choose **Request changes**, write "Nearly there, two small things", and click **Submit review (2 pending)**.`
}

export default article
