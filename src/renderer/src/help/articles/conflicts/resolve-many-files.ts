import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'conflicts/resolve-many-files',
  title: 'Resolve many files at once',
  category: 'conflicts',
  summary: 'Select several conflicted files, take one side for all of them, undo it, or use your own merge tool.',
  keywords: [
    'multi-select',
    'bulk',
    'many conflicts',
    'undo resolve',
    'external merge tool',
    'kaleidoscope',
    'beyond compare',
    'meld'
  ],
  related: ['conflicts/resolve-conflicts', 'conflicts/merge-tool', 'settings/settings-overview'],
  body: `## Several files at once

In **Conflicted files**, **Cmd+click** or **Shift+click** to select several, then right-click: **Take current**, **Take incoming** or **Mark N resolved** apply to all of them. **Mark All Resolved** marks every file at once.

Took the wrong side? An **Undo** banner appears after each of these, and puts the files back as they were.

## Your own merge tool

If you prefer Beyond Compare, Kaleidoscope, Meld, VS Code or another tool, choose it in **Settings > Merge tool**. Then right-click a conflicted file and choose **Open in <tool>**, press **Cmd+D** with it selected, or click **Open in <tool> ↗** in SillyGit's merge tool. When you save and close your tool, SillyGit marks the file resolved.

## Example

A rebase conflicts in 12 generated files and one real source file. Shift+click to select the 12 generated ones, right-click, **Take incoming**. Then open the source file in the merge tool and resolve it by hand.`
}

export default article
