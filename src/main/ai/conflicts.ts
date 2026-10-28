import type { AiConflictResolution, AiHunkResolution } from '../../shared/types'
import { conflictHunks, splitLines, type ConflictSegment } from '../../shared/conflicts'
import { AiError, callClaude, extractJson } from './client'

// Proposing resolutions for merge conflict hunks.

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
