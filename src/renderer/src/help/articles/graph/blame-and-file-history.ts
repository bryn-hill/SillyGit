import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/blame-and-file-history',
  title: 'Blame and file history',
  category: 'graph',
  summary: 'See who last changed each line of a file, and every commit that touched it.',
  keywords: ['blame', 'annotate', 'history', 'file history', 'who changed', 'follow', 'rename'],
  related: ['graph/search-and-filter', 'graph/diffs'],
  body: `For any file, SillyGit can show:

- **History:** every commit that changed the file, following it through renames, with the diff of each.
- **Blame:** the file's current content with the commit, author and age beside each block of lines. A heat strip shows newer lines brighter.

## Opening them

- Right-click a file anywhere (working copy, a commit, the full commit view) and choose **Blame** or **File history**.
- In a diff, use the **Blame** or **History** buttons.
- From the palette: **Blame file** or **File history**, then pick the file.

In blame, right-click a line to show that commit in the history, open the commit, show it in the graph, **blame before this change** (to dig past a reformat) or copy its SHA.

## Example

A function behaves oddly and you want to know why a check was added. Open **Blame** on the file, find the line, and the gutter shows "Sam, 3 months ago". Right-click it and choose **Open commit** to read the commit message that explains it.`
}

export default article
