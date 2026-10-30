import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'ai/ai-setup',
  title: 'Set up AI features',
  category: 'ai',
  summary: 'Sign in to Claude Code or add an Anthropic API key so the AI features work.',
  keywords: ['api key', 'anthropic', 'claude code', 'setup', 'sign in', 'ai not working'],
  related: ['ai/claude-panel', 'ai/ai-review', 'settings/settings-overview'],
  body: `The AI features use Claude. You need one of:

- **Claude Code** installed and signed in on this computer; the Claude panel uses it directly.
- An **Anthropic API key**, entered in **Settings > Anthropic API key** (stored only on this machine) or set as \`ANTHROPIC_API_KEY\` in your environment.

Nothing is sent to Claude unless you click an AI button or send a message in the Claude panel. Only the diff or files involved are sent.

If an AI button shows an error, check that Claude Code is signed in (run \`claude\` in a terminal) or that your API key is set.

## Example

You click **Generate message** and get "No API key". Open **Settings** (Cmd+,), paste your key into **Anthropic API key** and close Settings. Click **Generate message** again and a message appears.`
}

export default article
