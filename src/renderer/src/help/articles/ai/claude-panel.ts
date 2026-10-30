import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'ai/claude-panel',
  title: 'Work with Claude in the Claude panel',
  category: 'ai',
  summary: 'Chat with Claude Code about your repository, and let it read, edit and run things with your permission.',
  keywords: ['claude', 'ai', 'chat', 'assistant', 'claude code', 'agent', 'permissions', 'plan mode', 'model'],
  related: ['ai/ai-review', 'ai/ai-setup', 'conflicts/merge-tool'],
  body: `Click the sparkle button in the top bar, or press **Ctrl+Esc**, to open the Claude panel. It runs Claude Code in the current repository, so Claude can read your files, search, edit and run commands, with your permission.

## Talking to Claude

- Type a message and press **Enter**. Type **@** to mention a file and **/** for commands.
- Paste or drop images to show Claude a screenshot.
- Pick the **model** from the menu under the message box.
- Press **Esc** or the stop button to interrupt.
- **New conversation** starts afresh; **Past conversations** lists earlier ones in this repository so you can continue them.

## Permissions

The mode button under the message box decides how much Claude may do on its own; **Shift+Tab** cycles through:

| Mode | Claude… |
| --- | --- |
| Ask before edits | asks before editing files or running commands |
| Edit automatically | edits files without asking |
| Plan mode | explores and proposes a plan, without changing anything |
| Bypass permissions | runs every tool without asking |

When Claude asks, a card shows the edit or command, with choices such as **Yes**, **Yes, don't ask again this session**, or no. In plan mode, Claude shows its plan and waits; approve it to let Claude carry it out, or choose **No, keep planning**.

Changes Claude makes show up in your working copy like any other, so you review and commit them as usual.

## Example

Open the panel, switch to **Plan mode** and ask "Add a dark mode toggle to the settings page". Claude reads the code and proposes a plan. Approve it, choosing **Yes, auto-accept edits**. When it's done, select **Uncommitted changes** to review the diff before committing.`
}

export default article
