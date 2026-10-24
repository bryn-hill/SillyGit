import { getApiKey } from './settings'
import type { AiFinding, AiReviewResponse } from '../shared/types'
import type { DiffUnit } from '../shared/diffSplit'

const MODEL = 'claude-sonnet-5-5'
const MAX_DIFF_CHARS = 100000
const MAX_UNIT_CHARS = 6000
const SEVERITIES: AiFinding['severity'][] = ['high', 'medium', 'low', 'info']

class AiError extends Error {}

function buildPrompt(scopeLabel: string, meta: string, diff: string): string {
  let trimmedDiff = diff
  let truncatedNote = ''
  if (trimmedDiff.length > MAX_DIFF_CHARS) {
    trimmedDiff = trimmedDiff.slice(0, MAX_DIFF_CHARS)
    truncatedNote = '\n\n[diff truncated for length]'
  }
  return [
    `You are reviewing a git ${scopeLabel} as a careful senior code reviewer.`,
    meta,
    '',
    'Diff (unified format):',
    '```diff',
    trimmedDiff + truncatedNote,
    '```',
    '',
    'Report real, concrete issues only: bugs, correctness risks, security problems, or notable regressions introduced by this diff. Do not invent style nitpicks. If the diff looks fine, return an empty findings array.',
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"summary": "one sentence overall verdict", "findings": [{"file": "path or omit", "line": optional number, "severity": "high|medium|low|info", "summary": "one sentence description of the issue"}]}'
  ].join('\n')
}

function parseResponse(text: string): AiReviewResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { findings: [], raw: text }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: unknown
      findings?: unknown
    }
    const findings: AiFinding[] = Array.isArray(parsed.findings)
      ? (parsed.findings as unknown[])
          .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f) => ({
            file: typeof f.file === 'string' ? f.file : undefined,
            line: typeof f.line === 'number' ? f.line : undefined,
            severity: SEVERITIES.includes(f.severity as AiFinding['severity'])
              ? (f.severity as AiFinding['severity'])
              : 'info',
            summary: typeof f.summary === 'string' ? f.summary : ''
          }))
          .filter((f) => f.summary.length > 0)
      : []
    return {
      findings,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      raw: text
    }
  } catch {
    return { findings: [], raw: text }
  }
}

async function callClaude(prompt: string): Promise<string> {
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
      model: MODEL,
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

export async function reviewCommit(
  subject: string,
  body: string,
  diff: string
): Promise<AiReviewResponse> {
  const meta = `Commit subject: ${subject}${body ? `\nCommit body: ${body}` : ''}`
  const prompt = buildPrompt('commit', meta, diff)
  const text = await callClaude(prompt)
  return parseResponse(text)
}

export async function reviewFile(path: string, diff: string): Promise<AiReviewResponse> {
  const meta = `File: ${path}`
  const prompt = buildPrompt('file change', meta, diff)
  const text = await callClaude(prompt)
  return parseResponse(text)
}

function buildCommitMessagePrompt(diff: string): string {
  let trimmedDiff = diff
  let truncatedNote = ''
  if (trimmedDiff.length > MAX_DIFF_CHARS) {
    trimmedDiff = trimmedDiff.slice(0, MAX_DIFF_CHARS)
    truncatedNote = '\n\n[diff truncated for length]'
  }
  return [
    'Write a git commit message for the following staged changes.',
    '',
    'Diff (unified format):',
    '```diff',
    trimmedDiff + truncatedNote,
    '```',
    '',
    'Use the conventional style: a concise, imperative-mood subject line under 72 characters (e.g. "fix: handle empty input"), optionally followed by a blank line and a short body explaining the why if it is not obvious from the subject. Do not describe every line changed. Respond with ONLY the commit message text, no prose outside of it, no quotes or markdown fences around it.'
  ].join('\n')
}

export async function generateCommitMessage(diff: string): Promise<string> {
  const prompt = buildCommitMessagePrompt(diff)
  const text = await callClaude(prompt)
  return text.trim()
}

export interface SplitGroupResult {
  message: string
  unitIds: string[]
}

function buildSplitPrompt(subject: string, body: string, units: DiffUnit[]): string {
  let unitText = units
    .map((u) => {
      const label = u.hunkHeader
        ? `${u.file} ${u.hunkHeader}`
        : `${u.file} (whole-file change: binary, rename, or mode change with no diffable hunk)`
      const content =
        u.body.length > MAX_UNIT_CHARS ? u.body.slice(0, MAX_UNIT_CHARS) + '\n[unit truncated]' : u.body
      return `[${u.id}] ${label}${content ? `\n${content}` : ''}`
    })
    .join('\n\n')
  let truncatedNote = ''
  if (unitText.length > MAX_DIFF_CHARS) {
    unitText = unitText.slice(0, MAX_DIFF_CHARS)
    truncatedNote = '\n\n[unit list truncated for length]'
  }

  return [
    'You are splitting an overly-bundled git commit into multiple smaller, logically focused commits.',
    `Commit subject: ${subject}${body ? `\nCommit body: ${body}` : ''}`,
    '',
    'The commit is broken into the following change units (diff hunks, or whole-file changes that cannot be split further, such as binary files or pure renames). Each unit is tagged with an id in brackets:',
    '```diff',
    unitText + truncatedNote,
    '```',
    '',
    'Group these units into one or more commits, each representing a single logical change. Keep units from the same file together UNLESS they clearly represent unrelated concerns (e.g. an unrelated bug fix vs. a new feature touching the same file). Every unit id listed above must appear in EXACTLY ONE group: do not invent ids, do not omit any, do not duplicate any across groups. Order the groups in a sensible sequence (e.g. prerequisite or refactor changes before the features that build on them). Write a real, conventional commit subject line per group, and an optional short body for groups whose purpose is not obvious from the subject alone. If this commit is already a single focused change, return exactly one group containing every unit id.',
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"groups": [{"message": "commit subject line", "body": "optional longer explanation, or omit", "unitIds": ["f0h0", "f1h0"]}]}'
  ].join('\n')
}

function parseSplitResponse(text: string): SplitGroupResult[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new AiError('AI did not return a valid split proposal.')
  let parsed: { groups?: unknown }
  try {
    parsed = JSON.parse(jsonMatch[0]) as { groups?: unknown }
  } catch {
    throw new AiError('AI did not return valid JSON for the split proposal.')
  }
  if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
    throw new AiError('AI did not propose any groups.')
  }
  return (parsed.groups as unknown[]).map((g, i) => {
    if (!g || typeof g !== 'object') throw new AiError(`Group ${i + 1} in the AI response is invalid.`)
    const obj = g as Record<string, unknown>
    const subject = typeof obj.message === 'string' ? obj.message.trim() : ''
    const groupBody = typeof obj.body === 'string' ? obj.body.trim() : ''
    const unitIds = Array.isArray(obj.unitIds)
      ? (obj.unitIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    if (!subject) throw new AiError(`Group ${i + 1} in the AI response is missing a commit message.`)
    if (unitIds.length === 0) throw new AiError(`Group ${i + 1} in the AI response has no units.`)
    return { message: groupBody ? `${subject}\n\n${groupBody}` : subject, unitIds }
  })
}

export async function proposeCommitSplit(
  subject: string,
  body: string,
  units: DiffUnit[]
): Promise<SplitGroupResult[]> {
  const prompt = buildSplitPrompt(subject, body, units)
  const text = await callClaude(prompt)
  return parseSplitResponse(text)
}

export { AiError }
