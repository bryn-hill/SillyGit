import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/command-line',
  title: 'Open repositories from the terminal',
  category: 'getting-started',
  summary: 'Install the sillygit command, then run sillygit . to open the repository you are in.',
  keywords: ['command line', 'terminal', 'cli', 'shell', 'launch', 'path', 'sillygit .', 'install command', 'dock'],
  related: ['getting-started/open-a-repository', 'getting-started/command-palette'],
  body: `The **sillygit** command opens a repository in SillyGit straight from a terminal.

## Installing the command

Open the command palette (**Cmd+K**) and choose **Install sillygit command**. Where it goes depends on your system:

- **macOS:** a link in \`/usr/local/bin\`. If that folder isn't yours to write to, macOS asks for your password once.
- **Linux:** a link in \`~/.local/bin\`. SillyGit tells you if that folder isn't on your PATH yet.
- **Windows:** SillyGit adds its own \`bin\` folder to your user PATH. Open a new terminal to pick it up.

Run it again whenever SillyGit moves (a new download in another folder, say) and the command points at the new copy.

## Using it

| Command | What it does |
| --- | --- |
| \`sillygit .\` | Opens the repository you're in |
| \`sillygit ~/code/api\` | Opens that repository |
| \`sillygit src/app\` | Any folder or file inside a repository opens the whole repository |
| \`sillygit\` | Just brings SillyGit up |

The terminal is free again straight away. If SillyGit is already running, the repository opens as a new tab there (or switches to its tab if it's already open); otherwise SillyGit starts, puts your last session back and opens it on top. A folder that isn't a Git repository yet gets the usual offer to initialise one.

On macOS you can also drop a folder on SillyGit's Dock icon to open it.

## Example

You've just cloned a project in the terminal: \`git clone https://github.com/acme/api && cd api\`. Type \`sillygit .\` and the api repository opens in a new tab beside the ones you already had.`
}

export default article
