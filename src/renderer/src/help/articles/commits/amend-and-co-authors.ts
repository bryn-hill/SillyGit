import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/amend-and-co-authors',
  title: 'Amend commits and credit co-authors',
  category: 'commits',
  summary: 'Change the last commit, and add Co-authored-by trailers picked from your history.',
  keywords: ['amend', 'co-author', 'pair', 'trailer', 'last commit', 'reword', 'credit'],
  related: ['commits/stage-and-commit', 'commits/fixup-and-absorb', 'graph/commit-details'],
  body: `## Amending the last commit

Tick **Amend previous commit** under the message box. The box fills with the last commit's message; stage any extra changes, edit the message, and commit. The last commit is replaced with the new one. **Actions > Amend last commit** does the same.

Only amend commits you haven't pushed, or you'll need to force push and anyone who pulled it will have to sort out the difference.

## Co-authors

Click **Co-authors…** above the message box and pick people from the list, which comes from everyone who has committed to the repository. Each one becomes a \`Co-authored-by:\` trailer at the end of the message and a chip above it; click a chip's **×** to remove them. GitHub and other hosts credit co-authors on the commit.

## Example

You paired with Priya on a fix. Stage the changes, write the message, click **Co-authors…** and pick Priya. The message ends with \`Co-authored-by: Priya Shah <priya@example.com>\`. You spot a typo after committing: fix it, stage it, tick **Amend previous commit**, and click **Amend Commit**.`
}

export default article
