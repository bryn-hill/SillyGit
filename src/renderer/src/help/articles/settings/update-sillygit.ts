import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/update-sillygit',
  title: 'Keep SillyGit up to date',
  category: 'settings',
  summary: 'How installed SillyGit downloads new releases, and the Update button for source checkouts.',
  keywords: ['update', 'upgrade', 'new version', 'auto update', 'self update', 'release', 'restart', 'main'],
  related: ['settings/settings-overview'],
  body: `SillyGit checks GitHub for a new release when it starts and every few hours. When there is one, the **Update** button in the top bar lights up with a badge.

## Installed builds

Click **Update** (or **Update SillyGit…** in the palette) to see the new version, then **Download update**. It downloads in the background while you keep working. When it's done the button says **Restart**: click **Restart and update** and SillyGit closes, installs the new version and opens again. If you'd rather not restart now, it installs the next time you quit.

This works on macOS and with the Windows installer (\`.exe\`). If you unzipped the Windows \`.zip\` instead, SillyGit can't replace itself, so the dialog offers **Open download page** for the new version. The same goes for Linux builds other than an AppImage.

If a download fails, the dialog shows why and links to the Releases page (github.com/bryn-hill/SillyGit/releases) so you can download it by hand.

## Running from source

If you run SillyGit from a clone of its source code, **Update** pulls \`origin/main\` instead. SillyGit checks it every 30 minutes and the badge shows how many commits are new. Applying it fast-forwards your checkout, runs \`npm install\` if dependencies changed, rebuilds and restarts the app. Your uncommitted changes to the checkout are set aside and put back. It only updates when your checkout is on \`main\` with no commits of its own.

## Example

The **Update** button shows a badge. Click it: SillyGit 0.3.0 is out and you have 0.2.1. Click **Download update**, carry on working, and when the button says **Restart**, click it. SillyGit reopens on 0.3.0 with your tabs just as they were.`
}

export default article
