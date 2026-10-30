import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/stash',
  title: 'Stash changes for later',
  category: 'commits',
  summary: 'Set uncommitted changes aside, then apply or pop them back.',
  keywords: ['stash', 'pop', 'apply', 'shelve', 'set aside', 'save for later'],
  related: ['commits/stage-and-commit', 'conflicts/resolve-conflicts'],
  body: `A stash puts your uncommitted changes aside and gives you a clean working copy, so you can switch branches or pull without committing half-done work.

- **Stash:** the toolbar's **Stash** button stashes everything. **Actions > Stash changes with a message…** lets you name it.
- **Pop:** the toolbar's **Pop** button applies the newest stash and deletes it.
- **Your stashes:** listed under **STASHES** in the sidebar. Hover one for **Apply** (keep the stash), **Pop** (apply and delete) or **Delete**, or right-click it. **Apply stash** and **Pop stash** in the palette let you pick one.

If a stash clashes with changes you've made since, SillyGit shows the conflicts like any other; see [Resolve merge conflicts](help:conflicts/resolve-conflicts).

## Example

You're halfway through a feature when someone asks for an urgent fix on \`main\`. Click **Stash**, double-click \`main\`, fix and commit. Double-click your feature branch again and click **Pop**: your half-done work is back.`
}

export default article
