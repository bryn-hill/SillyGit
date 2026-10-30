import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/stash',
  title: 'Stash changes for later',
  category: 'commits',
  summary: 'Set uncommitted changes aside, see what a stash holds, then apply or pop it back.',
  keywords: ['stash', 'pop', 'apply', 'shelve', 'set aside', 'save for later', 'partial stash', 'keep index', 'stash files'],
  related: ['commits/stage-and-commit', 'conflicts/resolve-conflicts'],
  body: `A stash puts your uncommitted changes aside and gives you a clean working copy, so you can switch branches or pull without committing half-done work.

- **Stash everything:** the toolbar's **Stash** button stashes every change, untracked files included. **Actions > Stash changes with a message…** lets you name it.
- **Stash some files:** click **Stash…** at the top of the working changes (or **Actions > Stash some files…**). Tick the files to stash, give it a name if you like, and click **Stash**. Right-click a changed file and pick **Stash this file…** to start with just that one ticked.
- **Keep what's staged:** in **Stash…**, tick **Keep staged changes in the working tree too** to stash everything but leave your staged changes in place as well, ready to commit (git's \`--keep-index\`).
- **Pop:** the toolbar's **Pop** button applies the newest stash and deletes it.
- **See what's in a stash:** click one under **STASHES** in the sidebar. The panel on the right lists its changed files, and untracked files separately; click a file for its diff. **Apply**, **Pop** and **Delete** are at the top of the panel.
- **Your stashes:** hover one in the sidebar for **Apply** (keep the stash), **Pop** (apply and delete) or **Delete**, or right-click it. Double-click applies it. **Apply stash**, **Pop stash** and **Show stash** in the palette let you pick one.

If a stash clashes with changes you've made since, SillyGit shows the conflicts like any other; see [Resolve merge conflicts](help:conflicts/resolve-conflicts).

## Example

You're halfway through a feature when someone asks for an urgent fix on \`main\`. Click **Stash**, double-click \`main\`, fix and commit. Double-click your feature branch again and click **Pop**: your half-done work is back.`
}

export default article
