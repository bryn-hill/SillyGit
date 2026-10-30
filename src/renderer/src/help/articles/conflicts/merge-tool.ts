import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'conflicts/merge-tool',
  title: 'Use the merge tool',
  category: 'conflicts',
  summary: 'The three-way merge tool: pick each chunk, edit the result, and get AI suggestions.',
  keywords: ['merge tool', 'three-way', 'chunk', 'hunk', 'resolve', 'ai suggestion', 'output', 'save'],
  related: ['conflicts/resolve-conflicts', 'conflicts/resolve-many-files', 'ai/ai-review'],
  body: `Click a conflicted file to open the merge tool. It shows your side (**current**) and their side (**incoming**) next to each other, with the **output** below.

- For each conflict, tick the lines or the whole chunk you want from either side. You can take both, in either order.
- Edit the output directly for anything the two sides can't give you.
- **Previous conflict** and **Next conflict** step through them.
- **Save** (Cmd+S) writes the output and marks the file resolved. **Esc** closes without saving.

## AI suggestions

Click **✨ Auto-resolve with AI** to have Claude propose a resolution for each conflict. Each suggestion appears in the output for you to **Accept** or **Reject**, or use **Accept all AI suggestions** and **Reject all**. Nothing is saved until you click **Save**. This needs Claude Code signed in or an Anthropic API key.

## Example

Both branches added an import to the top of \`app.ts\`. In the merge tool, tick the import from current, then the one from incoming, so the output has both. Press **Cmd+S** and the file moves to **Staged**.`
}

export default article
