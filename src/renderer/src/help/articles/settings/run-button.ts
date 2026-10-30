import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/run-button',
  title: 'Run your project',
  category: 'settings',
  summary: 'Run a command such as npm run dev from the toolbar, on your working copy or any commit in isolation.',
  keywords: ['run', 'start', 'dev server', 'npm run dev', 'isolation', 'worktree', 'test a commit'],
  related: ['remotes-prs/check-out-pull-request', 'settings/custom-commands', 'rebase-history/bisect'],
  body: `The **Run** button in the toolbar runs your project's command in a terminal tab. The first time, SillyGit suggests one from your \`package.json\` (such as \`npm run dev\`); change it any time with **Edit run command…** in the Run menu. Each repository has its own.

- With your working copy selected, **Run** runs it in your repository folder.
- With an older commit selected, the caret menu offers:
  - **Run in isolation**: runs that commit in a private copy of the repository, installing dependencies when needed, so your own work isn't touched. You can run your working copy at the same time.
  - **Check out and run**: checks the commit out in your repository and runs it there. It refuses if you have uncommitted changes.

Whichever you pick becomes what **Run** does. While it runs, the button becomes **Stop**.

## Example

A teammate's pull request changes the checkout page and you want to try it without stashing your own work. Check out or select its newest commit, choose **Run in isolation**, and the app starts from a private copy. Your own branch and changes stay exactly as they were.`
}

export default article
