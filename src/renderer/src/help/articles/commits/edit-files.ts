import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/edit-files',
  title: 'Edit files in SillyGit or your editor',
  category: 'commits',
  summary: 'Make quick edits in the built-in editor, or open files and repositories in your IDE.',
  keywords: ['edit', 'editor', 'monaco', 'ide', 'vs code', 'open in editor', 'cursor', 'jetbrains', 'save'],
  related: ['graph/diffs', 'settings/settings-overview'],
  body: `## Built-in editor

Click **Edit file** in a diff, or the pencil next to a changed file, to edit it right in SillyGit. The editor (the same one VS Code uses) takes the place of the graph, with the detail panel still beside it. **Cmd+S** saves. If you switch tabs with unsaved changes they're kept, and SillyGit asks before closing a tab that has them. If the file changes on disk while you have no unsaved edits, the editor reloads it.

## Your own editor

The toolbar's editor button (it shows your editor's name) opens the whole repository in your IDE; **Cmd+Shift+A** does the same. Its menu lets you pick from the editors SillyGit found: VS Code, Cursor, Windsurf, Zed, Sublime Text, JetBrains IDEs, Xcode, Nova, BBEdit and more. Right-click any file and choose **Open in <editor>** to open just that file.

Set the default, or a custom command using \`$REPO\` and \`$FILE\`, in **Settings > Open in editor**.

## Example

A test fails because of a one-character typo. Click the file in the working copy, click **Edit file**, fix it, **Cmd+S**, and the diff updates. For a bigger change, press **Cmd+Shift+A** to open the repo in VS Code.`
}

export default article
