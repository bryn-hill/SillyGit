import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'getting-started/keyboard-shortcuts',
  title: 'Keyboard shortcuts',
  category: 'getting-started',
  summary: 'Every keyboard shortcut in SillyGit, by area.',
  keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys', 'cheat sheet', 'cmd', 'ctrl', 'f1', 'stage', 'push', 'pull', 'fetch', 'switch branch'],
  related: ['getting-started/command-palette', 'rebase-history/undo-and-redo', 'conflicts/merge-tool'],
  body: `On macOS use **Cmd**; on Windows and Linux use **Ctrl** wherever this page says Cmd. Shortcuts that already say Ctrl use Ctrl everywhere.

## Anywhere

| Keys | What it does |
| --- | --- |
| Cmd+K or Cmd+Shift+P | Command palette |
| F1 or ? | Help centre |
| Cmd+/ | This list of shortcuts |
| Cmd+, | Settings |
| Cmd+O or Cmd+T | Open a repository in a new tab |
| Ctrl+Tab, Ctrl+Shift+Tab | Next or previous tab |
| Cmd+Shift+[ and ] | Previous or next tab |
| Cmd+1 to Cmd+9 | Go to a tab (9 is the last) |
| Ctrl+\` | Show or hide the terminal |
| Ctrl+Esc | Show or hide the Claude panel |
| Esc | Leave the focused control, close a menu or dialog |

## In a repository

| Keys | What it does |
| --- | --- |
| Cmd+F | Search commits |
| Cmd+B | Switch branch (the palette's Checkout list) |
| Cmd+Shift+F | Fetch all remotes |
| Cmd+Shift+L | Pull, the way the Pull button does |
| Cmd+Shift+U | Push |
| Cmd+Z | Undo the last Git operation |
| Cmd+Shift+Z | Redo |
| Cmd+Shift+A | Open the repository in your editor |
| Cmd+Enter | Commit (in the commit message box) |
| Up and Down | Move through the graph or a file list |
| Cmd+click, Shift+click | Select several commits or files |

## Unstaged and Staged files

Click a file, or move to it with Up and Down, then:

| Keys | What it does |
| --- | --- |
| S | Stage the file and move to the next one |
| U | Unstage the file and move to the next one |
| D, Delete or Backspace | Discard the file's changes (asks first) |
| Page Up, Page Down, Space | Scroll the open diff |
| Home, End | Jump to the top or bottom of the diff |

Single-letter keys never fire while you're typing in a text box.

## Merge tool and conflicts

| Keys | What it does |
| --- | --- |
| Cmd+S | Save the result and mark the file resolved |
| Cmd+D | Open the file in your external merge tool |
| Esc | Close the merge tool |

## Interactive rebase

| Keys | What it does |
| --- | --- |
| P, R, S, F, D | Pick, reword, squash, fixup or drop the focused commit |
| Alt+Up, Alt+Down | Move the focused commit up or down |

## Editor and Claude panel

| Keys | What it does |
| --- | --- |
| Cmd+S | Save the file in the built-in editor |
| Enter | Send your message to Claude |
| Shift+Tab | Cycle Claude's permission mode |
| Esc | Stop Claude's current turn |

## Example

To find and fix a mistake fast: press **Cmd+F**, type part of the commit message and press **Enter** to jump to it. Spotted the problem in your last commit? Press **Cmd+Z** to undo it, fix the file, then type the message again and press **Cmd+Enter** to commit.

To commit a few files and push: click the first file in **Unstaged**, press **S** for each one you want, type the message, press **Cmd+Enter**, then **Cmd+Shift+U** to push.`
}

export default article
