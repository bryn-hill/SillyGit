import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/git-lfs',
  title: 'Work with Git LFS',
  category: 'commits',
  summary: 'See large files tracked by Git LFS as their real content, track new ones and fetch or prune LFS files.',
  keywords: ['lfs', 'large files', 'git-lfs', 'pointer', 'track', 'binary', 'assets'],
  related: ['graph/diffs', 'commits/stage-and-commit'],
  body: `Git LFS keeps large files outside the repository and stores small pointer files in their place. SillyGit understands this:

- Files stored in LFS get an **LFS** badge, and their diffs show the real content. Switch to **Pointer** in the diff bar to see the pointer file Git stores.
- To track a file type, right-click a file and use **Track with LFS** (**Only this file**, or **All *.psd files** for its extension). This updates \`.gitattributes\`, which you then commit.
- In an LFS repository the palette has **Git LFS: Fetch files**, **Git LFS: Pull files** and **Git LFS: Prune old files**.

If the repository uses LFS but \`git-lfs\` isn't installed, a banner says so with a **Get Git LFS** button, and **Git LFS: Install git-lfs…** in the palette.

## Example

Your game repo is filling up with textures. Right-click \`hero.psd\`, choose **Track with LFS > All *.psd files**, and commit the \`.gitattributes\` change. New \`.psd\` files now go to LFS automatically.`
}

export default article
