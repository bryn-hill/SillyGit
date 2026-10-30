import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/update-sillygit',
  title: 'Keep SillyGit up to date',
  category: 'settings',
  summary: 'The Update button for SillyGit run from a source checkout, and updating installed builds.',
  keywords: ['update', 'upgrade', 'new version', 'self update', 'main'],
  related: ['settings/settings-overview'],
  body: `If you run SillyGit from a clone of its source code, the **Update** button in the top bar keeps it current. SillyGit checks \`origin/main\` every 30 minutes and shows a badge with how many commits are new.

Click **Update** (or **Update SillyGit…** in the palette) to see what's coming in. Applying it fast-forwards your checkout, runs \`npm install\` if dependencies changed, rebuilds and restarts the app. Your uncommitted changes to the checkout are set aside and put back.

It only updates when your checkout is on \`main\` with no commits of its own. Installed builds (from a download) don't show the button; to update those, download the newest build from the Releases page of SillyGit's GitHub repository (github.com/bryn-hill/sillygit/releases) and replace the app.

## Example

The **Update** button shows a badge of 4. Click it, read the four incoming changes, and click update. SillyGit rebuilds and reopens with your tabs just as they were.`
}

export default article
