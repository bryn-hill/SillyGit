import { getApiKey } from '../settings'
import type { AiFinding } from '../../shared/types'

// The API call itself, the models and the size limits the prompts share.

const MODEL = 'claude-sonnet-5-5'
// Grouping diff hunks into logical commits is a mechanical classification
// task, not one that needs frontier reasoning, so it runs on the cheapest
// current model to keep split proposals fast and low-cost.
export const SPLIT_MODEL = 'claude-haiku-5-5'
export const MAX_DIFF_CHARS = 100000
export const MAX_UNIT_CHARS = 6000
export const MAX_FILE_CONTEXT_CHARS = 20000
export const MAX_TOTAL_CONTEXT_CHARS = 80000
export const SEVERITIES: AiFinding['severity'][] = ['high', 'medium', 'low', 'info']

export class AiError extends Error {}

export async function callClaude(prompt: string, model: string = MODEL): Promise<string> {
  // An explicitly stored/env API key overrides subscription billing; otherwise
  // the Agent SDK's subprocess inherits process.env and authenticates via
  // CLAUDE_CODE_OAUTH_TOKEN or the locally logged-in Claude Code session.
  const apiKey = await getApiKey()
  const { query } = await import('@anthropic-ai/claude-agent-sdk')

  let text = ''
  let errorText: string | null = null

  for await (const message of query({
    prompt,
    options: {
      model,
      maxTurns: 1,
      tools: [],
      permissionMode: 'dontAsk',
      settingSources: [],
      ...(apiKey ? { env: { ...process.env, ANTHROPIC_API_KEY: apiKey } } : {})
    }
  })) {
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        text = message.result
      } else {
        errorText = message.errors.join('; ') || `AI request failed (${message.subtype})`
      }
    }
  }

  if (errorText) throw new AiError(errorText)
  if (!text) {
    throw new AiError(
      'No response from Claude. Run `claude login`, or set CLAUDE_CODE_OAUTH_TOKEN / an API key in Settings.'
    )
  }
  return text
}

export function extractJson(text: string, what = 'the split proposal'): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new AiError(`AI did not return valid JSON for ${what}.`)
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    throw new AiError(`AI did not return valid JSON for ${what}.`)
  }
}
