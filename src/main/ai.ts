import { getApiKey } from './settings'
import type { AiConflictResolution, AiFinding, AiHunkResolution, AiReviewResponse } from '../shared/types'
import { conflictHunks, splitLines, type ConflictSegment } from '../shared/conflicts'
import type { DiffUnit } from '../shared/diffSplit'

const MODEL = 'claude-sonnet-5-5'
// Grouping diff hunks into logical commits is a mechanical classification
// task, not one that needs frontier reasoning, so it runs on the cheapest
// current model to keep split proposals fast and low-cost.
const SPLIT_MODEL = 'claude-haiku-5-5'
const MAX_DIFF_CHARS = 100000
const MAX_UNIT_CHARS = 6000
const MAX_FILE_CONTEXT_CHARS = 20000
const MAX_TOTAL_CONTEXT_CHARS = 80000
const SEVERITIES: AiFinding['severity'][] = ['high', 'medium', 'low', 'info']

export interface FileContext {
  path: string
  content: string
}

class AiError extends Error {}

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

async function callClaude(prompt: string, model: string = MODEL): Promise<string> {
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

// Smallest per-unit body excerpt worth sending once the budget is tight; below
// this the model gets only the file name and hunk header.
const MIN_UNIT_CHARS = 200

function renderUnits(units: DiffUnit[], cap: number): string {
  return units
    .map((u) => {
      const label = u.hunkHeader
        ? `${u.file} ${u.hunkHeader}`
        : `${u.file} (whole-file change: binary, rename, or mode change with no diffable hunk)`
      const content = u.body.length > cap ? u.body.slice(0, cap) + '\n[unit truncated]' : u.body
      return `[${u.id}] ${label}${content ? `\n${content}` : ''}`
    })
    .join('\n\n')
}

/**
 * Renders every unit so the whole list fits in MAX_DIFF_CHARS. Large commits
 * shrink each unit's body excerpt rather than cutting the list off, because a
 * unit the model never sees can't be assigned to a group.
 */
function renderUnitsWithinBudget(units: DiffUnit[]): string {
  const full = renderUnits(units, MAX_UNIT_CHARS)
  if (full.length <= MAX_DIFF_CHARS) return full
  let lo = 0
  let hi = MAX_UNIT_CHARS
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (renderUnits(units, mid).length <= MAX_DIFF_CHARS) lo = mid
    else hi = mid - 1
  }
  return renderUnits(units, lo < MIN_UNIT_CHARS ? 0 : lo)
}

function buildSplitPrompt(subject: string, body: string, units: DiffUnit[]): string {
  return [
    'You are splitting an overly-bundled git commit into multiple smaller, logically focused commits.',
    `Commit subject: ${subject}${body ? `\nCommit body: ${body}` : ''}`,
    '',
    `The commit is broken into the following ${units.length} change units (diff hunks, or whole-file changes that cannot be split further, such as binary files or pure renames). Each unit is tagged with an id in brackets:`,
    '```diff',
    renderUnitsWithinBudget(units),
    '```',
    '',
    `Group these units into one or more commits, each representing a single logical change. Keep units from the same file together UNLESS they clearly represent unrelated concerns (e.g. an unrelated bug fix vs. a new feature touching the same file). Every one of the ${units.length} unit ids listed above must appear in EXACTLY ONE group: do not invent ids, do not omit any, do not duplicate any across groups. Order the groups in a sensible sequence (e.g. prerequisite or refactor changes before the features that build on them). Write a real, conventional commit subject line per group, and an optional short body for groups whose purpose is not obvious from the subject alone. If this commit is already a single focused change, return exactly one group containing every unit id.`,
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"groups": [{"message": "commit subject line", "body": "optional longer explanation, or omit", "unitIds": ["f0h0", "f1h0"]}]}'
  ].join('\n')
}

function buildLeftoverPrompt(
  groups: SplitGroupResult[],
  leftovers: DiffUnit[],
  units: DiffUnit[]
): string {
  const unitFile = new Map(units.map((u) => [u.id, u.file]))
  const groupText = groups
    .map((g, i) => {
      const files = [...new Set(g.unitIds.map((id) => unitFile.get(id)))].join(', ')
      return `Group ${i + 1}: ${g.message.split('\n')[0]}\n  files: ${files}`
    })
    .join('\n')
  return [
    'You are finishing a proposal to split a git commit into smaller commits. These groups are already decided:',
    groupText,
    '',
    'The following change units were left out and still need a home:',
    '```diff',
    renderUnitsWithinBudget(leftovers),
    '```',
    '',
    'Assign every unit above to exactly one existing group (by its number) or to a new group with its own conventional commit subject line.',
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"assignments": [{"group": 2, "unitIds": ["f3h0"]}, {"message": "new commit subject line", "unitIds": ["f4h1"]}]}'
  ].join('\n')
}

function extractJson(text: string, what = 'the split proposal'): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new AiError(`AI did not return valid JSON for ${what}.`)
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    throw new AiError(`AI did not return valid JSON for ${what}.`)
  }
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function parseSplitResponse(text: string): SplitGroupResult[] {
  const parsed = extractJson(text)
  if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
    throw new AiError('AI did not propose any groups.')
  }
  return (parsed.groups as unknown[]).map((g, i) => {
    if (!g || typeof g !== 'object') throw new AiError(`Group ${i + 1} in the AI response is invalid.`)
    const obj = g as Record<string, unknown>
    const subject = typeof obj.message === 'string' ? obj.message.trim() : ''
    const groupBody = typeof obj.body === 'string' ? obj.body.trim() : ''
    if (!subject) throw new AiError(`Group ${i + 1} in the AI response is missing a commit message.`)
    return { message: groupBody ? `${subject}\n\n${groupBody}` : subject, unitIds: stringIds(obj.unitIds) }
  })
}

/**
 * Drops ids the model invented or repeated (first group wins) and any group
 * left empty, so the result only ever references real units once each.
 */
function dedupeGroups(groups: SplitGroupResult[], units: DiffUnit[]): SplitGroupResult[] {
  const known = new Set(units.map((u) => u.id))
  const seen = new Set<string>()
  return groups
    .map((g) => ({
      message: g.message,
      unitIds: g.unitIds.filter((id) => {
        if (!known.has(id) || seen.has(id)) return false
        seen.add(id)
        return true
      })
    }))
    .filter((g) => g.unitIds.length > 0)
}

function missingUnits(groups: SplitGroupResult[], units: DiffUnit[]): DiffUnit[] {
  const assigned = new Set(groups.flatMap((g) => g.unitIds))
  return units.filter((u) => !assigned.has(u.id))
}

function applyLeftoverAssignments(text: string, groups: SplitGroupResult[], leftovers: DiffUnit[]): void {
  const parsed = extractJson(text)
  if (!Array.isArray(parsed.assignments)) return
  const pending = new Set(leftovers.map((u) => u.id))
  for (const a of parsed.assignments as unknown[]) {
    if (!a || typeof a !== 'object') continue
    const obj = a as Record<string, unknown>
    const ids = stringIds(obj.unitIds).filter((id) => pending.delete(id))
    if (ids.length === 0) continue
    const index = typeof obj.group === 'number' ? obj.group - 1 : -1
    const message = typeof obj.message === 'string' ? obj.message.trim() : ''
    if (groups[index]) groups[index].unitIds.push(...ids)
    else if (message) groups.push({ message, unitIds: ids })
    // Anything else stays unplaced and falls through to the file-based fallback.
  }
}

/**
 * Last resort for units the model never placed: join the group that already
 * holds another hunk of the same file, otherwise collect them in one final
 * group so the proposal always covers the whole commit.
 */
function assignByFile(groups: SplitGroupResult[], leftovers: DiffUnit[], units: DiffUnit[]): void {
  const unitFile = new Map(units.map((u) => [u.id, u.file]))
  const groupForFile = new Map<string, SplitGroupResult>()
  for (const g of groups) {
    for (const id of g.unitIds) {
      const file = unitFile.get(id)!
      if (!groupForFile.has(file)) groupForFile.set(file, g)
    }
  }
  const rest: string[] = []
  for (const u of leftovers) {
    const g = groupForFile.get(u.file)
    if (g) g.unitIds.push(u.id)
    else rest.push(u.id)
  }
  if (rest.length > 0) groups.push({ message: 'chore: remaining changes', unitIds: rest })
}

export async function proposeCommitSplit(
  subject: string,
  body: string,
  units: DiffUnit[]
): Promise<SplitGroupResult[]> {
  const text = await callClaude(buildSplitPrompt(subject, body, units), SPLIT_MODEL)
  const groups = dedupeGroups(parseSplitResponse(text), units)
  if (groups.length === 0) throw new AiError('AI did not assign any units to a group.')

  let leftovers = missingUnits(groups, units)
  if (leftovers.length > 0) {
    try {
      const followUp = await callClaude(buildLeftoverPrompt(groups, leftovers, units), SPLIT_MODEL)
      applyLeftoverAssignments(followUp, groups, leftovers)
    } catch {
      // A failed follow-up isn't fatal: the file-based fallback below still places them.
    }
    leftovers = missingUnits(groups, units)
    if (leftovers.length > 0) assignByFile(groups, leftovers, units)
  }
  return groups
}

// Lines of unconflicted code shown around each conflict when the whole file is too long to send.
const CONFLICT_CONTEXT_LINES = 40
const MAX_CONFLICT_FILE_CHARS = 60000
const CONFIDENCES: AiHunkResolution['confidence'][] = ['high', 'medium', 'low']

export interface ConflictPromptInput {
  path: string
  currentLabel: string
  incomingLabel: string
  segments: ConflictSegment[]
}

function conflictBlock(hunk: Extract<ConflictSegment, { kind: 'conflict' }>, input: ConflictPromptInput): string {
  return [
    `<<<<<<< CONFLICT ${hunk.id} — CURRENT (${input.currentLabel})`,
    hunk.ours.join('').replace(/\r?\n$/, ''),
    `||||||| BASE (common ancestor)`,
    hunk.base.join('').replace(/\r?\n$/, ''),
    `======= INCOMING (${input.incomingLabel})`,
    hunk.theirs.join('').replace(/\r?\n$/, ''),
    `>>>>>>> END CONFLICT ${hunk.id}`
  ].join('\n')
}

/**
 * The file with its conflicts written as numbered blocks. A long file is cut
 * down to the conflicts and the lines around them.
 */
function renderConflictedFile(input: ConflictPromptInput): string {
  const full = input.segments
    .map((s) => (s.kind === 'common' ? s.lines.join('').replace(/\r?\n$/, '') : conflictBlock(s, input)))
    .join('\n')
  if (full.length <= MAX_CONFLICT_FILE_CHARS) return full
  const parts: string[] = []
  input.segments.forEach((s, i) => {
    if (s.kind === 'conflict') {
      parts.push(conflictBlock(s, input))
      return
    }
    const first = i === 0
    const last = i === input.segments.length - 1
    const n = CONFLICT_CONTEXT_LINES
    if (s.lines.length <= (first || last ? n : n * 2)) parts.push(s.lines.join('').replace(/\r?\n$/, ''))
    else {
      const head = first ? [] : s.lines.slice(0, n)
      const tail = last ? [] : s.lines.slice(-n)
      parts.push([head.join(''), `[… ${s.lines.length - head.length - tail.length} unchanged lines …]\n`, tail.join('')].join('').replace(/\r?\n$/, ''))
    }
  })
  return parts.join('\n')
}

export function buildConflictPrompt(input: ConflictPromptInput): string {
  const hunks = conflictHunks(input.segments)
  return [
    `You are resolving git merge conflicts in the file ${input.path}.`,
    `CURRENT is the branch being merged into (${input.currentLabel}); INCOMING is ${input.incomingLabel}. BASE is their common ancestor, so comparing each side with BASE shows what that side changed.`,
    '',
    `The file, with its ${hunks.length} conflict${hunks.length === 1 ? '' : 's'} written as numbered blocks:`,
    '```',
    renderConflictedFile(input),
    '```',
    '',
    'For each conflict, write the code that should replace the whole block. Keep the intent of both sides wherever they are compatible (for example, both sides added different items, or one side renamed something the other side edited). When the sides truly contradict each other, pick the one that best fits the rest of the file and say so. Never leave conflict markers in your answer, and match the surrounding indentation. Give "low" confidence when you are guessing.',
    '',
    'Respond with ONLY valid JSON matching this shape, no prose outside the JSON:',
    '{"summary": "one sentence about the merge", "resolutions": [{"conflict": 0, "resolved": "the replacement code, lines separated by \\n (empty string to remove the block)", "confidence": "high|medium|low", "explanation": "one sentence on what you kept and why"}]}'
  ].join('\n')
}

const MARKER_LINE = /^(<{7}|={7}|>{7}|\|{7})/m

/**
 * Turns Claude's answer into per-hunk resolutions. Drops answers for hunks
 * that don't exist, repeats, and any that still contain conflict markers.
 */
export function parseConflictResponse(text: string, segments: ConflictSegment[]): AiConflictResolution {
  const hunks = conflictHunks(segments)
  const ids = new Set(hunks.map((h) => h.id))
  const eol = segments.some((s) => (s.kind === 'common' ? s.lines : [...s.ours, ...s.theirs]).some((l) => l.endsWith('\r\n')))
    ? '\r\n'
    : '\n'
  const parsed = extractJson(text, 'the conflict resolutions')
  const resolutions: AiHunkResolution[] = []
  const seen = new Set<number>()
  for (const r of Array.isArray(parsed.resolutions) ? (parsed.resolutions as unknown[]) : []) {
    if (!r || typeof r !== 'object') continue
    const obj = r as Record<string, unknown>
    const id = typeof obj.conflict === 'number' ? obj.conflict : Number(obj.conflict)
    if (!ids.has(id) || seen.has(id) || typeof obj.resolved !== 'string') continue
    if (MARKER_LINE.test(obj.resolved)) continue
    seen.add(id)
    const normalised = obj.resolved.replace(/\r\n/g, '\n')
    const lines = splitLines(normalised).map((l) => l.replace(/\n$/, '') + eol)
    resolutions.push({
      hunkId: id,
      lines,
      confidence: CONFIDENCES.includes(obj.confidence as AiHunkResolution['confidence'])
        ? (obj.confidence as AiHunkResolution['confidence'])
        : 'low',
      explanation: typeof obj.explanation === 'string' ? obj.explanation : ''
    })
  }
  if (resolutions.length === 0) throw new AiError('Claude did not suggest a resolution for any conflict.')
  return {
    hunkCount: hunks.length,
    resolutions: resolutions.sort((a, b) => a.hunkId - b.hunkId),
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined
  }
}

export async function resolveConflicts(input: ConflictPromptInput): Promise<AiConflictResolution> {
  if (conflictHunks(input.segments).length === 0) throw new AiError('This file has no conflicts left to resolve.')
  const text = await callClaude(buildConflictPrompt(input))
  return parseConflictResponse(text, input.segments)
}

export { AiError }
