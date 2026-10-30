import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/settings-overview',
  title: 'Settings at a glance',
  category: 'settings',
  summary: 'What you can change in Settings, from theme and accounts to merge tools and custom commands.',
  keywords: ['settings', 'preferences', 'options', 'configure', 'cmd+,'],
  related: ['settings/appearance-and-layout', 'integrations/accounts', 'settings/custom-commands', 'ai/ai-setup'],
  body: `Open Settings with the cog in the top-right corner or **Cmd+,**. Changes are saved as you make them.

| Section | What it sets |
| --- | --- |
| Appearance | Light, dark or match the system |
| Accounts | Tokens for GitHub, GitLab, Bitbucket, Gitea, Azure DevOps and Jira |
| Notifications | Which pull request events notify you, and how often to check |
| Show author avatars | Pictures beside commits, or initials only |
| Animate new commits and merges | The graph animations |
| Branches | Tag stale branches, and after how long |
| Sprints | Sprint markers on the graph |
| Open in editor | Your IDE, or a custom command |
| Merge tool | An external merge tool for conflicts |
| Custom commands | Your own shell commands in menus and the palette |
| Fetch in the background | How often to fetch, or **Never** |
| Anthropic API key | For the AI features |

Settings are stored in \`sillygit-settings.json\` in your app data folder. Your Git config is never changed by Settings.

## Example

You'd rather fetch by hand. Press **Cmd+,**, set **Fetch in the background** to **Never**, and close Settings. SillyGit now only fetches when you click **Pull** or **Fetch**.`
}

export default article
