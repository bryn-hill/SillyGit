import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/git-flow',
  title: 'Use git-flow',
  category: 'branches',
  summary: 'Start and finish features, releases and hotfixes the git-flow way, without installing git-flow.',
  keywords: ['git-flow', 'gitflow', 'feature', 'release', 'hotfix', 'develop', 'finish', 'tag'],
  related: ['branches/branch-menu', 'branches/create-and-switch'],
  body: `SillyGit has git-flow built in; you don't need the \`git-flow\` tool.

## Setting up

**Actions > Git flow: Set up…** asks for your production branch (usually \`main\` or \`master\`), development branch (\`develop\`), branch prefixes (\`feature/\`, \`release/\`, \`hotfix/\`) and version tag prefix. It's saved in the repository's Git config, so other git-flow tools read it too. Setting up doesn't switch your branch.

## Starting and finishing

- Right-click \`develop\` and choose **Start feature from develop…** or **Start release from develop…**; right-click \`main\` for **Start hotfix from main…**. The palette has **Git flow: Start …** too.
- Right-click a feature, release or hotfix branch and choose **Finish …**.
  - A feature merges into \`develop\`.
  - A release or hotfix merges into \`main\`, gets a version tag, and merges back into \`develop\` (a hotfix goes into an open release instead, if there is one).

Finishing never pushes; push when you're happy. If a merge hits conflicts, resolve them and choose **Finish** again to carry on.

## Example

Version 1.4 is ready. Right-click \`develop\`, **Start release from develop…**, name it \`1.4.0\`. Bump the version and commit, then right-click \`release/1.4.0\` and **Finish release 1.4.0…**. It lands on \`main\` tagged \`v1.4.0\` and is merged back into \`develop\`.`
}

export default article
