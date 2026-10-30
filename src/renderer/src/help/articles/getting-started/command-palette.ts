import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/command-palette',
  title: 'Run any command from the palette',
  category: 'getting-started',
  summary: 'Search every action by name with Cmd+K, including checkout, merge, stash and settings.',
  keywords: ['palette', 'command', 'actions', 'search', 'cmd+k', 'ctrl+k', 'keyboard', 'run'],
  related: ['getting-started/keyboard-shortcuts', 'settings/custom-commands'],
  body: `The command palette lists nearly everything SillyGit can do. Open it with **Cmd+K** or **Cmd+Shift+P** (Ctrl on Windows and Linux), type a few letters of what you want and press **Enter**.

The **Actions** button in the top bar opens the same list as a dropdown, sorted alphabetically, which is handy for browsing.

## How searching works

- Every word you type must appear in the command's name, in any order: \`stash msg\` finds **Stash changes with a message…**.
- Some commands open a list to pick from, like **Checkout**, **Merge into…**, **Delete branch**, **Apply stash**, **Blame file** or **Open recent repository**. Searching from the top level reaches inside those lists too, so typing a branch name finds "Check out feature/login" directly.
- Inside a list, **Backspace** in an empty search box goes back up a level.
- Commands that only make sense now appear when they apply, for example **Continue rebase** during a rebase or the Git LFS commands in an LFS repository.
- Your own [custom commands](help:settings/custom-commands) appear in the list too, and every help article is listed as **Help: <title>**.

## Example

You want to rebase your branch onto \`main\` without reaching for the mouse. Press **Cmd+K**, type \`rebase main\` and press **Enter**. SillyGit runs \`git rebase main\` on the branch you have checked out.`
}

export default article
