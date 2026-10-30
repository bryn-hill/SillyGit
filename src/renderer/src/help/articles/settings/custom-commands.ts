import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/custom-commands',
  title: 'Add your own commands',
  category: 'settings',
  summary: 'Shell commands of your own in the commit, branch and file menus and the command palette.',
  keywords: ['custom commands', 'shell', 'script', 'scripts', 'placeholders', 'automation', 'menu'],
  related: ['getting-started/command-palette', 'settings/run-button', 'settings/settings-overview'],
  body: `In **Settings > Custom commands**, add commands you run often. Each has a name, a shell command and where it appears:

| Scope | Shows up in |
| --- | --- |
| Repository | the command palette |
| Branch | the branch menu, and the palette for the current branch |
| Commit | the commit menu, and the palette for the selected commit |
| File | the file menu |

Use placeholders in the command: \`$REPO\`, \`$CURRENT_BRANCH\`, \`$BRANCH\`, \`$SHA\`, \`$SHORT_SHA\` and \`$FILE\`. SillyGit quotes the values for you, so don't wrap them in quotes. Commands run in a terminal tab so you can see their output.

## Example

You often deploy a commit to staging. Add a **Commit** command named "Deploy to staging" with \`./scripts/deploy.sh staging $SHA\`. Now right-click any commit, open **Custom commands** and choose **Deploy to staging**.`
}

export default article
