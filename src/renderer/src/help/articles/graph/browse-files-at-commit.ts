import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/browse-files-at-commit',
  title: 'Browse files at any commit',
  category: 'graph',
  summary: "See every file as it was at a commit, even ones the commit didn't change, and save an old version.",
  keywords: ['files', 'tree', 'browse', 'old version', 'revision', 'snapshot', 'save as', 'ls-tree', 'checkout file'],
  related: ['graph/commit-details', 'graph/blame-and-file-history'],
  body: `Select a commit and the detail panel has two tabs above its files:

- **Changes** lists the files the commit changed, as before.
- **Files** lists every file in the repository as it was at that commit, in folders. Click a folder to open it, or type in **Filter** to find a file by name. Files the commit changed carry their **M** or **A** mark.

Click a file to see it full window. A changed file opens its diff; any other file opens as it was then, read-only, with its size. Images show as pictures, and a binary or very large file just says so.

Right-click a file, or use the buttons above it, for:

- **Save as…** writes that version of the file wherever you choose, without touching your working directory. A file in Git LFS is saved as the real file, not its pointer.
- **Blame** and **File history** start from that commit, so you see the file's story up to that point.
- **Show commits to this file in graph**, **Copy file path** and your custom file commands, as on any file.

The tab you pick stays put as you step through the graph, and so do the folders you opened. A submodule shows in the tree but can't be opened.

## Example

A config file worked last month and you want the old copy back. Select a commit from back then, pick **Files**, filter for \`config\`, right-click the file and choose **Save as…**. Compare it with today's, or copy the bits you need.`
}

export default article
