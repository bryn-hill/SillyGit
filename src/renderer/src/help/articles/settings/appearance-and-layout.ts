import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/appearance-and-layout',
  title: 'Theme, panels and the terminal',
  category: 'settings',
  summary: 'Switch between light and dark, resize and hide panels, and use the built-in terminal.',
  keywords: ['theme', 'dark', 'light', 'system', 'appearance', 'terminal', 'panels', 'resize', 'layout'],
  related: ['settings/settings-overview', 'getting-started/the-window'],
  body: `## Theme

**Settings > Appearance** offers **Dark**, **Light** or **Match the system**, which follows your operating system and switches with it.

## Panels

Drag the borders between the sidebar, graph, detail panel, terminal and Claude panel to resize them. Sizes, and whether the terminal and Claude panel are open, are remembered between launches.

## Terminal

Press **Ctrl+\`** or click **Terminal** in the toolbar for a terminal at the bottom of the window, opened in the repository's folder. It's a full terminal: your shell, your aliases, colours and all. Open more tabs with **+**. The Run button and bisect runs use their own tabs here.

## Example

You work in a bright room. Press **Cmd+,**, choose **Light**, close Settings. Then press **Ctrl+\`**, run \`npm test\` in the terminal, and drag its top edge up to see more output.`
}

export default article
