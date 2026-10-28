import type { DiffUnit } from '../../shared/diffSplit'
import { AiError, MAX_DIFF_CHARS, MAX_UNIT_CHARS, SPLIT_MODEL, callClaude, extractJson } from './client'

// Proposing how to split one commit into several.

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
