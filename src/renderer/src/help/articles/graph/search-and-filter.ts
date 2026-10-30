import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/search-and-filter',
  title: 'Search and filter history',
  category: 'graph',
  summary: 'Find commits by message, author, file path or changed text, and filter the graph to a file or folder.',
  keywords: ['search', 'find', 'filter', 'author', 'message', 'pickaxe', '-S', '-G', 'regex', 'path', 'folder history'],
  related: ['graph/commit-graph', 'graph/blame-and-file-history'],
  body: `Press **Cmd+F**, or click the search box above the graph, and type. Press **Enter** to jump to the next match; SillyGit loads older history as needed to reach it.

## Search modes

Choose what to search in the **Search in** menu next to the box, or type a prefix:

| Mode | Prefix | Finds |
| --- | --- | --- |
| All | | message, author or SHA |
| Message | \`msg:\` | commit messages |
| Author | \`author:\` | author names and emails |
| File path | \`path:\` | commits that touched matching files |
| Changes | \`-S\` | commits that added or removed the text |
| Changes (regex) | \`-G\` | commits whose changed lines match a regex |

## Filtering to a file or folder

In **File path** mode, click **Filter** to show only the commits that touch that path; the rest of the graph is hidden and lines join up across the gaps. You can also right-click a file and choose **Show commits to this file in graph** or **Show history of this folder**. A chip above the graph shows the filter; click **Clear filter** to see everything again.

## Example

A config value changed and nobody knows when. Press **Cmd+F**, type \`-S timeoutMs\` and press **Enter**. The graph jumps to the most recent commit that added or removed \`timeoutMs\`; press **Enter** again for the one before.`
}

export default article
