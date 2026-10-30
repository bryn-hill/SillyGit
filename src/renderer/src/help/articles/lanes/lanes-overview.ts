import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'lanes/lanes-overview',
  title: 'Work on several branches at once with lanes',
  category: 'lanes',
  summary: 'Lanes let you keep changes for different branches in one working copy and commit each to its own branch.',
  keywords: ['lanes', 'virtual branches', 'parallel', 'several branches', 'workspace', 'multiple branches'],
  related: ['lanes/manage-lanes', 'commits/stage-and-commit', 'branches/create-and-switch'],
  body: `Normally you can only have one branch checked out. Lanes let you work on several at once in the same folder: each lane is a real branch, and every change you make belongs to one lane. When you commit, each lane's changes go to its own branch.

It's useful when you spot an unrelated fix in the middle of a feature, or want to run two features together while keeping them as separate pull requests.

## Turning lanes on

Click **Lanes…** above your changed files, or choose **Turn on lanes (work on several branches at once)…** in the palette. Your current branch becomes the first lane, and lanes are based on the branch it started from. The detail panel now shows one box per lane, each with its own files, message and **Commit** button.

## How changes are assigned

New changes go to the **default lane** (marked in the panel). Once a line belongs to a lane, edits near it stay in that lane. To move a file, drag it onto another lane or right-click it and choose **Move to <lane>**. In a diff, you can move single hunks between lanes too.

Your working copy contains every applied lane's changes at once, so you can build and test them together.

## Example

You're building \`feature/charts\` and notice a typo in the README. Turn lanes on, click **+ Lane** and call it \`fix/readme-typo\`. Fix the typo and drag \`README.md\` into the new lane. Commit each lane: the chart work goes to \`feature/charts\`, the typo to \`fix/readme-typo\`, and each gets its own pull request.`
}

export default article
