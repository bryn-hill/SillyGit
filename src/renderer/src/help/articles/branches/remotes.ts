import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'branches/remotes',
  title: 'Manage remotes',
  category: 'branches',
  summary: 'Add, rename, re-point, fetch and remove the remotes a repository talks to.',
  keywords: ['remote', 'upstream', 'origin', 'fork', 'url', 'fetch', 'add remote', 'rename remote', 'remove remote'],
  related: ['branches/tags-worktrees-submodules', 'branches/create-and-switch'],
  body: `## The Remotes list

The **REMOTES** group in the sidebar lists every remote with a short form of its URL. Hover one to see the full URL (and the push URL, if it's different). Click a remote to fetch just that remote; the toolbar's **Fetch** button still fetches all of them.

## Add a remote

Click **Add remote…** at the bottom of the list, or choose it from the command palette. Give it a name, then its URL. SillyGit adds the remote and fetches it straight away, so its branches show under **REMOTE**.

## Change or remove one

Right-click a remote to:

- **Fetch** it
- **Edit URL…**, for example after the repository moved or you switched from HTTPS to SSH
- **Edit push URL…**, shown only when pushes go to a different URL
- **Rename…** it. Git moves its remote branches and keeps your local branches tracking them
- **Copy URL** or **Open on the web**
- **Remove** it. Its remote branches go from the list and local branches that tracked it stop tracking. Nothing on the server is deleted

## Example

You forked a project and cloned your fork, so \`origin\` is your copy. To keep up with the original, click **Add remote…**, name it \`upstream\` and paste the original repository's URL. Its branches appear as \`upstream/main\` and so on, and you can merge or rebase onto them like any other branch.`
}

export default article
