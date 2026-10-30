import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'ai/ai-review',
  title: 'AI review, commit messages and commit splitting',
  category: 'ai',
  summary: 'Ask Claude to review a commit or file, write a commit message, or split a large commit into focused ones.',
  keywords: ['ai review', 'review', 'commit message', 'generate', 'split commit', 'ask ai', 'claude'],
  related: ['ai/claude-panel', 'ai/ai-setup', 'commits/commit-message-help', 'conflicts/merge-tool'],
  body: `Besides the [Claude panel](help:ai/claude-panel), SillyGit has one-click AI help in a few places:

- **Ask AI to review commit:** select a commit; this button at the bottom of its details asks Claude to look for bugs and problems in it. **Ask AI about this file** (on a file in the commit) reviews just that file.
- **Generate message:** above the commit box, writes a message from your staged changes. Always read it before committing.
- **Split commit with AI:** on your latest commit, Claude proposes splitting a commit that does several things into focused commits, each with its own message. Review the groups and click **Apply split**, or **Cancel**.
- **✨ Auto-resolve with AI** in the merge tool suggests conflict resolutions; see [the merge tool](help:conflicts/merge-tool).

Each of these sends the relevant diff to Claude. They need Claude Code signed in or an Anthropic API key; see [Set up AI features](help:ai/ai-setup).

## Example

You've made one big commit that renames a module and fixes a bug. Select it and click **Split commit with AI**. Claude proposes two commits: "refactor: rename billing module" and "fix(billing): round totals". Click **Apply split**, and your branch now has the two.`
}

export default article
