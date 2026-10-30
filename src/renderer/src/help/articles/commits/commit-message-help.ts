import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'commits/commit-message-help',
  title: 'Get help writing commit messages',
  category: 'commits',
  summary: 'Quick actions for routine commits, and AI-generated messages.',
  keywords: ['quick actions', 'commit message', 'generate', 'ai message', 'version bump', 'conventional commits', 'suggestion'],
  related: ['commits/stage-and-commit', 'ai/ai-review'],
  body: `SillyGit has two ways to fill in a commit message.

## Quick actions (no AI)

Simple rules look at what you've staged and suggest a message for routine changes, such as a version bump in \`package.json\`, dependency updates or a lockfile refresh. When one fits, a **Use …** chip appears above the message box; click it to use the message. The **Quick actions ▾** menu lists the suggestions, can **Bump version** (patch, minor or major) in \`package.json\` for you, and can **Prefix with** a Conventional Commits type such as \`fix:\` or \`feat:\`. Nothing is sent anywhere.

## Generate message (AI)

Click **Generate message** above the message box. SillyGit sends the staged diff to Claude and writes a message from it. Read it and edit before you commit. This needs Claude Code signed in or an Anthropic API key; see [AI review and commit messages](help:ai/ai-review).

## Example

It's release day. Open **Quick actions ▾ > Bump version > Minor → 2.4.0**; SillyGit updates \`package.json\` and its lockfile. Stage both and a chip offers **Use chore: bump version to 2.4.0**. Click it, then **Commit**.`
}

export default article
