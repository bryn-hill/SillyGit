import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/line-staging',
  title: 'Stage hunks and single lines',
  category: 'commits',
  summary: 'Stage, unstage or discard part of a file: a hunk or just the lines you pick.',
  keywords: ['hunk', 'line', 'partial', 'stage lines', 'patch', 'add -p', 'discard hunk'],
  related: ['commits/stage-and-commit', 'graph/diffs', 'commits/fixup-and-absorb'],
  body: `When a file has several unrelated changes, you can commit them separately.

## Hunks

Open the file's diff from the working copy. Each hunk has a bar with **Stage Hunk** (or **Unstage Hunk** in a staged file) and, for unstaged changes, **Discard Hunk**.

## Lines

Click the gutter next to added or removed lines to pick them; **Shift+click** picks a range. The hunk bar changes to **Stage 3 Lines** (or however many), and only those lines move. Unpicked lines stay where they are.

Line actions are off while **ignore whitespace** is on, because the diff you see then isn't the one Git would apply.

## Example

While fixing a bug you also left a \`console.log\` in the same hunk. Open the diff, click the gutter beside the two lines of the real fix, click **Stage 2 Lines**, and commit. The \`console.log\` stays unstaged, ready to discard.`
}

export default article
