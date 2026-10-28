import type { AiFinding, AiReviewResponse } from '../../shared/types'
import { MAX_DIFF_CHARS, MAX_FILE_CONTEXT_CHARS, MAX_TOTAL_CONTEXT_CHARS, SEVERITIES, callClaude } from './client'

// AI code review of a commit or a single file.

export interface FileContext {
  path: string
  content: string
}

// A diff hunk alone can't show whether a symbol it uses is declared
// elsewhere in the file, which produces false "undefined"/"missing
// declaration" findings. Passing the full post-change file content alongside
// the diff lets the model check before flagging something as missing.
function buildFileContexts(files: FileContext[]): FileContext[] {
  const result: FileContext[] = []
  let total = 0
  for (const f of files) {
    if (total >= MAX_TOTAL_CONTEXT_CHARS) break
    const cap = Math.min(MAX_FILE_CONTEXT_CHARS, MAX_TOTAL_CONTEXT_CHARS - total)
    const content = f.content.length > cap ? f.content.slice(0, cap) + '\n[truncated]' : f.content
    result.push({ path: f.path, content })
    total += content.length
  }
  return result
}

function buildPrompt(scopeLabel: string, meta: string, diff: string, fileContexts: FileContext[] = []): string {
  let trimmedDiff = diff
  let truncatedNote = ''
  if (trimmedDiff.length > MAX_DIFF_CHARS) {
    trimmedDiff = trimmedDiff.slice(0, MAX_DIFF_CHARS)
    truncatedNote = '\n\n[diff truncated for length]'
  }

  const lines = [`You are reviewing a git ${scopeLabel} as a careful senior code reviewer.`, meta, '']

  const contexts = buildFileContexts(fileContexts)
  if (contexts.length > 0) {
    lines.push(
      'Full content of the changed file(s) after this change, for context only. Use it to check whether a symbol, import, or declaration exists elsewhere in the file before flagging it as missing or undefined.'
    )
    for (const f of contexts) {
      lines.push('```' + f.path, f.content, '```')
    }
    lines.push('')
  }

  lines.push(
    'Diff (unified format):',
    '```diff',
    trimmedDiff + truncatedNote,
    '```',
    '',
    'Report real, concrete issues only: bugs, correctness risks, security problems, or notable regressions introduced by this diff. Do not invent style nitpicks. Before reporting that something is missing, undefined, or never declared, check the full file content above (when provided) — it may simply be outside the diff hunk. If the diff looks fine, return an empty findings array.',
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"summary": "one sentence overall verdict", "findings": [{"file": "path or omit", "line": optional number, "severity": "high|medium|low|info", "summary": "one sentence description of the issue"}]}'
  )

  return lines.join('\n')
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

export async function reviewCommit(
  subject: string,
  body: string,
  diff: string,
  fileContexts: FileContext[] = []
): Promise<AiReviewResponse> {
  const meta = `Commit subject: ${subject}${body ? `\nCommit body: ${body}` : ''}`
  const prompt = buildPrompt('commit', meta, diff, fileContexts)
  const text = await callClaude(prompt)
  return parseResponse(text)
}

export async function reviewFile(
  path: string,
  diff: string,
  fileContexts: FileContext[] = []
): Promise<AiReviewResponse> {
  const meta = `File: ${path}`
  const prompt = buildPrompt('file change', meta, diff, fileContexts)
  const text = await callClaude(prompt)
  return parseResponse(text)
}
