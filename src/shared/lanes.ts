import { parseCommitDiff } from './diffSplit'
import { cutHunk } from './lineStaging'

// Lanes (virtual branches): several branches applied to one working tree at
// once, every uncommitted change owned by one of them. Each lane is a real
// branch. HEAD sits on a merge of the applied lanes that SillyGit makes (the
// workspace commit), so what isn't committed yet is the working tree's diff
// against it, and each added or removed line of that diff belongs to a lane.
//
// This module is the pure part: reading that diff into owned lines, keeping
// owners stable while the files change, and cutting a lane's share of the
// diff into a patch.

/** The branch HEAD sits on while lanes are on. */
export const WORKSPACE_BRANCH = 'sillygit/workspace'

/** Who owns one changed line, remembered between refreshes. */
export interface OwnerRecord {
  path: string
  kind: ChangeKind
  /** Hash of the line's text. */
  hash: string
  pos: number
  lane: string
}

export interface LaneEntry {
  name: string
  applied: boolean
}

/** What `.git/sillygit/lanes.json` holds while lanes are on. */
export interface LanesState {
  version: 1
  /** The branch new lanes start from. */
  base: string
  lanes: LaneEntry[]
  defaultLane: string
  owners: OwnerRecord[]
  /** The workspace commit SillyGit made last; HEAD moving off it means something else committed. */
  workspace: string
}

/** An added or removed line, or a whole file that can't be split (new, deleted, binary or mode-only). */
export type ChangeKind = '+' | '-' | 'file'

export interface ChangeLine {
  path: string
  kind: ChangeKind
  /** Which file block and hunk of the diff it's in; hunk is -1 for a whole file. */
  file: number
  hunk: number
  /** Index into the hunk's body lines, as `cutHunk` counts them. */
  index: number
  text: string
  hash: string
  /** Where it sits in the working copy: the new-side line it is, or comes before for a removal. */
  pos: number
  /** Line number on its own side: old for a removal, new for an addition. */
  line: number
}

export interface FileChange {
  path: string
  /** 'A' new, 'D' deleted, 'M' anything else. */
  status: 'A' | 'D' | 'M'
  /** True when it moves between lanes only as a whole. */
  whole: boolean
  headerLines: string[]
  hunks: string[][]
}

export interface ParsedChanges {
  files: FileChange[]
  lines: ChangeLine[]
}

/** A short, stable hash of a line's text (FNV-1a), enough to tell lines apart in one file. */
export function lineHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function blockPath(headerLines: string[]): string {
  const text = headerLines.join('\n')
  const plus = /^\+\+\+ b\/(.+)$/m.exec(text)
  if (plus) return plus[1]
  const minus = /^--- a\/(.+)$/m.exec(text)
  if (minus) return minus[1]
  const git = /^diff --git a\/.+ b\/(.+)$/.exec(headerLines[0])
  return git ? git[1] : '(unknown)'
}

/**
 * Reads the working tree's diff against the workspace commit (`git diff`
 * with no renames, three lines of context) into files and changed lines.
 */
export function parseChanges(diffText: string): ParsedChanges {
  const { fileBlocks } = parseCommitDiff(diffText)
  const files: FileChange[] = []
  const lines: ChangeLine[] = []
  fileBlocks.forEach((block, fi) => {
    const path = blockPath(block.headerLines)
    const header = block.headerLines.join('\n')
    const status = /^new file mode/m.test(header) ? 'A' : /^deleted file mode/m.test(header) ? 'D' : 'M'
    const whole = status !== 'M' || block.hunks.length === 0
    files.push({ path, status, whole, headerLines: block.headerLines, hunks: block.hunks.map((h) => h.lines) })
    if (whole) {
      lines.push({ path, kind: 'file', file: fi, hunk: -1, index: -1, text: '', hash: status, pos: 0, line: 0 })
      return
    }
    block.hunks.forEach((hunk, hi) => {
      const m = HUNK_RE.exec(hunk.headerLine)
      if (!m) return
      let oldLine = Number(m[1])
      let newLine = Number(m[2])
      let index = -1
      const body = hunk.lines.slice(1)
      if (body.length > 0 && body[body.length - 1] === '') body.pop()
      for (const raw of body) {
        if (raw.startsWith('\\')) continue
        index++
        const kind = raw[0]
        const text = raw.slice(1)
        if (kind === '+') {
          lines.push({ path, kind: '+', file: fi, hunk: hi, index, text, hash: lineHash(text), pos: newLine, line: newLine })
          newLine++
        } else if (kind === '-') {
          lines.push({ path, kind: '-', file: fi, hunk: hi, index, text, hash: lineHash(text), pos: newLine, line: oldLine })
          oldLine++
        } else {
          oldLine++
          newLine++
        }
      }
    })
  })
  return { files, lines }
}

/** How far (in lines) a new change can be from an owned one and still join its lane. */
const NEAR = 3

export interface ResolveOptions {
  /** The applied lanes; records for any other lane are ignored. */
  lanes: ReadonlySet<string>
  /** Where a change goes when nothing else decides (the default lane). */
  fallback: string
  /** Where lines no record matches go, instead of the rules below. */
  unmatchedLane?: string
  /** Files only one applied lane's commits touched, and that lane. */
  fileLanes?: ReadonlyMap<string, string>
}

/**
 * Works out which lane owns each changed line. A line remembered in
 * `records` (same file, kind and text) keeps its lane, matched in order when
 * a text repeats. A line that isn't, e.g. one just typed, joins the lane of
 * the closest owned line in its file when that's within a few lines, so a
 * block being edited stays together; then the lane whose commits changed
 * the file, if only one did; anything else goes to the fallback.
 */
export function resolveOwners(lines: readonly ChangeLine[], records: readonly OwnerRecord[], options: ResolveOptions): string[] {
  const { lanes, fallback, unmatchedLane, fileLanes } = options
  const owners: (string | null)[] = lines.map(() => null)
  const key = (path: string, kind: string, hash: string): string => `${path}\0${kind}\0${hash}`

  const recordGroups = new Map<string, OwnerRecord[]>()
  for (const r of records) {
    if (!lanes.has(r.lane)) continue
    const k = key(r.path, r.kind, r.hash)
    const group = recordGroups.get(k)
    if (group) group.push(r)
    else recordGroups.set(k, [r])
  }
  const lineGroups = new Map<string, number[]>()
  lines.forEach((l, i) => {
    const k = key(l.path, l.kind, l.hash)
    const group = lineGroups.get(k)
    if (group) group.push(i)
    else lineGroups.set(k, [i])
  })

  for (const [k, idxs] of lineGroups) {
    const recs = recordGroups.get(k)
    if (!recs) continue
    if (recs.length === idxs.length) {
      // The same lines as before: pair them up in order, which survives lines moving.
      const sortedRecs = [...recs].sort((a, b) => a.pos - b.pos)
      const sortedIdxs = [...idxs].sort((a, b) => lines[a].pos - lines[b].pos)
      sortedIdxs.forEach((i, n) => (owners[i] = sortedRecs[n].lane))
      continue
    }
    // Some came or went: closest pairs first.
    const pairs: { i: number; r: number; d: number }[] = []
    idxs.forEach((i) => recs.forEach((rec, r) => pairs.push({ i, r, d: Math.abs(rec.pos - lines[i].pos) })))
    pairs.sort((a, b) => a.d - b.d)
    const usedRec = new Set<number>()
    for (const p of pairs) {
      if (owners[p.i] !== null || usedRec.has(p.r)) continue
      owners[p.i] = recs[p.r].lane
      usedRec.add(p.r)
    }
  }

  if (unmatchedLane !== undefined) {
    return owners.map((o) => o ?? unmatchedLane)
  }

  // Unowned lines follow the nearest owned line in the same file, spreading
  // through a run of new lines one step at a time.
  const byFile = new Map<string, number[]>()
  lines.forEach((l, i) => {
    if (l.kind === 'file') return
    const list = byFile.get(l.path)
    if (list) list.push(i)
    else byFile.set(l.path, [i])
  })
  for (const idxs of byFile.values()) {
    idxs.sort((a, b) => lines[a].pos - lines[b].pos || a - b)
    let changed = true
    while (changed) {
      changed = false
      for (let n = 0; n < idxs.length; n++) {
        const i = idxs[n]
        if (owners[i] !== null) continue
        let best: { lane: string; d: number } | null = null
        for (const m of [n - 1, n + 1]) {
          const j = idxs[m]
          if (j === undefined || owners[j] === null) continue
          const d = Math.abs(lines[j].pos - lines[i].pos)
          if (d <= NEAR && (!best || d < best.d)) best = { lane: owners[j]!, d }
        }
        if (best) {
          owners[i] = best.lane
          changed = true
        }
      }
    }
  }
  return owners.map((o, i) => o ?? fileLanes?.get(lines[i].path) ?? fallback)
}

/** The records to keep for lines and their owners. */
export function ownerRecords(lines: readonly ChangeLine[], owners: readonly string[]): OwnerRecord[] {
  return lines.map((l, i) => ({ path: l.path, kind: l.kind, hash: l.hash, pos: l.pos, lane: owners[i] }))
}

/**
 * The patch for a lane's share of one file: each hunk cut down to the lines
 * it owns (`picked`, as line indexes per hunk). Null when it owns none.
 */
export function laneFilePatch(file: FileChange, picked: ReadonlyMap<number, ReadonlySet<number>>, reverse: boolean): string | null {
  const hunks: string[] = []
  file.hunks.forEach((hunk, hi) => {
    const sel = picked.get(hi)
    if (!sel || sel.size === 0) return
    const cut = cutHunk(hunk, sel, reverse)
    if (cut) hunks.push(...cut)
  })
  if (hunks.length === 0) return null
  return [...file.headerLines, ...hunks].join('\n') + '\n'
}

/** A lane's name is a branch name SillyGit can use: no spaces, nothing git refuses. */
export function laneNameProblem(name: string): string | null {
  if (!name.trim()) return 'Give the lane a name.'
  if (name === WORKSPACE_BRANCH) return 'That name is SillyGit’s own.'
  if (/\s/.test(name)) return 'Branch names can’t contain spaces.'
  if (/[~^:?*[\\]|\.\.|@\{|\/\/|^\/|\/$|\.lock$|^-|\.$/.test(name)) return 'That isn’t a valid branch name.'
  return null
}

// ---- What the renderer sees ----

/** Which changes to move: whole files (optionally only the part in one lane) or single lines. */
export interface LaneMove {
  files?: { path: string; fromLane?: string }[]
  lines?: { path: string; kind: '+' | '-'; line: number }[]
}

export interface LaneInfo {
  name: string
  applied: boolean
  isDefault: boolean
  /** Index into the lane colours, stable while the lane exists. */
  color: number
  /** Commits on the lane that aren't on the base. */
  ahead: number
  upstream: string | null
  /** Commits not pushed to its upstream (all of `ahead` without one). */
  unpushed: number
  /** Uncommitted changes set aside while it was unapplied. */
  hasSavedChanges: boolean
}

export interface LaneFile {
  path: string
  lane: string
  status: 'A' | 'D' | 'M'
  added: number
  removed: number
  /** True when the file isn't tracked yet. */
  untracked: boolean
}

/** One changed line's owner, to colour the diff with. */
export interface LaneLineOwner {
  path: string
  kind: '+' | '-'
  /** Old-side line for a removal, new-side for an addition. */
  line: number
  lane: string
}

export type LanesDrift =
  /** HEAD left the workspace branch, e.g. a checkout in a terminal. */
  | { kind: 'switched'; branch: string | null }
  /** Commits were made on the workspace branch outside SillyGit. */
  | { kind: 'commits'; count: number }
  /** A lane's branch moved outside SillyGit (pulled, reset…). */
  | { kind: 'lanes-moved'; lanes: string[] }

export interface LanesStatus {
  base: string
  lanes: LaneInfo[]
  files: LaneFile[]
  lines: LaneLineOwner[]
  drift: LanesDrift | null
  /** What "Undo lane change" would undo, or null when there's nothing. */
  undoLabel: string | null
}

/** Summarises parsed changes and their owners into one row per file and lane. */
export function laneFiles(parsed: ParsedChanges, owners: readonly string[], untracked: ReadonlySet<string>): LaneFile[] {
  const rows = new Map<string, LaneFile>()
  parsed.lines.forEach((l, i) => {
    const lane = owners[i]
    const k = `${lane}\0${l.path}`
    let row = rows.get(k)
    if (!row) {
      const file = parsed.files[l.file]
      row = { path: l.path, lane, status: file.status, added: 0, removed: 0, untracked: untracked.has(l.path) }
      rows.set(k, row)
    }
    if (l.kind === '+') row.added++
    else if (l.kind === '-') row.removed++
  })
  return [...rows.values()].sort((a, b) => a.path.localeCompare(b.path))
}
