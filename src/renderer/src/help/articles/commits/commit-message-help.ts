import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/commit-message-help',
  title: 'Get help writing commit messages',
  category: 'commits',
  summary: 'Commit templates, recent messages, Conventional Commits types, quick actions and AI messages.',
  keywords: [
    'quick actions',
    'commit message',
    'generate',
    'ai message',
    'version bump',
    'conventional commits',
    'suggestion',
    'commit template',
    'commit.template',
    'recent messages',
    'type',
    'scope'
  ],
  related: ['commits/stage-and-commit', 'ai/ai-review'],
  body: `SillyGit has several ways to fill in a commit message.

## Commit template

If git's \`commit.template\` is set (for this repo or globally), the message box starts from that file each time it's empty, with its \`#\` comment lines taken out. **Commit** stays off until you change the template text. To bring the template back, pick **Recent ▾ > Commit template**.

## Recent messages

**Recent ▾** lists your last messages in this repo, newest first, one per subject (fixup and squash commits are left out). Hover one to see the whole message; click it to use it. Co-authors you've already picked are kept.

## Type and scope

**Type ▾** puts a Conventional Commits prefix such as \`feat:\` or \`fix(ui):\` on the first line, replacing any prefix that's there and keeping a breaking-change \`!\`. Types and scopes this repo's history already uses come first, so each type opens a list of the scopes your team writes. The current prefix is ticked.

## Quick actions (no AI)

Simple rules look at what you've staged and suggest a message for routine changes, such as a version bump in \`package.json\`, dependency updates or a lockfile refresh. When one fits, a **Use …** chip appears above the message box; click it to use the message. The **Quick actions ▾** menu lists the suggestions, can **Bump version** (patch, minor or major) in \`package.json\` for you. Nothing is sent anywhere.

## Generate message (AI)

Click **Generate message** above the message box. SillyGit sends the staged diff to Claude and writes a message from it. Read it and edit before you commit. This needs Claude Code signed in or an Anthropic API key; see [AI review and commit messages](help:ai/ai-review).

## Example

It's release day. Open **Quick actions ▾ > Bump version > Minor → 2.4.0**; SillyGit updates \`package.json\` and its lockfile. Stage both and a chip offers **Use chore: bump version to 2.4.0**. Click it, then **Commit**.`
}

export default article
