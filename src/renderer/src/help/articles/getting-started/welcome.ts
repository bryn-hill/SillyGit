import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/welcome',
  title: 'Welcome to SillyGit',
  category: 'getting-started',
  summary: 'What SillyGit is, what it runs, and where to start.',
  keywords: ['intro', 'overview', 'start', 'first use', 'tour', 'walkthrough', 'new', 'licence', 'license', 'warranty', 'liability', 'disclaimer'],
  related: [
    'getting-started/open-a-repository',
    'getting-started/the-window',
    'getting-started/command-palette',
    'getting-started/keyboard-shortcuts'
  ],
  body: `SillyGit is a desktop Git client. It shows your history as a commit graph, lets you stage down to single lines, walks you through merge conflicts, and brings pull requests, issues and a Claude panel into the same window.

The name is silly; the Git underneath is real. SillyGit runs the \`git\` on your \`PATH\` with your own config, hooks and credentials, so anything it does you could also do in a terminal, and anything you do in a terminal shows up in SillyGit straight away. **Actions > Activity log** lists every Git command it ran.

## Where to start

1. [Open a repository](help:getting-started/open-a-repository), or clone one.
2. Look round [the window](help:getting-started/the-window): branches on the left, the graph in the middle, details on the right.
3. Make a change and [commit it](help:commits/stage-and-commit).
4. [Push, pull and fetch](help:remotes-prs/push-pull-fetch) to share your work.

Press **Cmd+K** (Ctrl+K on Windows and Linux) at any time to search for a command, and **F1** or **?** to come back here.

## Example

You've just installed SillyGit and want to see a project you already have on disk. Click the folder button at the left of the tab bar, pick the project folder, and its history appears. Choose **Help > Start walkthrough** from the **?** button in the top bar for a one-minute tour of what you're looking at.

## No warranty

SillyGit is free software under the MIT licence and comes with no warranty. It is provided as is, and its authors aren't liable for any damage or lost work that comes from using it, including bugs. Git keeps most things recoverable (see [the reflog](help:rebase-history/reflog)), but keep your work pushed or backed up.`
}

export default article
