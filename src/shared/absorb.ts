// Absorbing staged changes into the commits they fix: each staged hunk goes to
// the newest unpushed commit that last touched the lines it changes, as
// git-absorb and GitButler do. These are the pure parts; src/main/fixup.ts
// runs git.

export interface AbsorbCommit {
  hash: string
  shortHash: string
  subject: string
}

export interface AbsorbHunk {
  /** The hunk's unit id in the staged diff (see diffSplit.parseCommitDiff). */
  unitId: string
  file: string
  header: string
  added: number
  removed: number
  /** The commit it would be folded into, or null to leave it staged. */
  target: string | null
  /** Why no commit was found, when target is null. */
  reason?: string
}

export interface AbsorbPlan {
  branch: string
  head: string
  /** The staged diff the plan was made from; absorbing refuses if it changed. */
  diffText: string
  /** Commits a hunk can go into, newest first: the branch's commits not on any remote. */
  candidates: AbsorbCommit[]
  hunks: AbsorbHunk[]
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/

/**
 * The lines of the file before the change (1-based) whose last commit decides
 * where a hunk belongs: the lines it removes, or for a pure insertion the
 * lines either side of where it goes.
 */
export function linesToBlame(header: string, body: string): number[] {
  const m = HUNK_HEADER_RE.exec(header)
  if (!m) return []
  const oldStart = Number(m[1])
  const oldCount = m[2] == null ? 1 : Number(m[2])
  const oldEnd = oldStart + oldCount - 1
  const removed: number[] = []
  const around = new Set<number>()
  let oldLine = oldStart
  for (const line of body.split('\n')) {
    if (line.startsWith('\\')) continue
    if (line.startsWith('-')) {
      removed.push(oldLine)
      oldLine++
    } else if (line.startsWith('+')) {
      around.add(oldLine - 1)
      around.add(oldLine)
    } else if (line.length > 0 || oldLine <= oldEnd) {
      oldLine++
    }
  }
  if (removed.length > 0) return removed
  return [...around].filter((n) => n >= Math.max(1, oldStart) && n <= oldEnd).sort((a, b) => a - b)
}

/** The newest candidate (candidates are newest first) among the commits blamed for a hunk's lines. */
export function pickTarget(blamed: ReadonlySet<string>, candidates: AbsorbCommit[]): string | null {
  return candidates.find((c) => blamed.has(c.hash))?.hash ?? null
}

/** The commit message that makes `git rebase --autosquash` fold a commit into `hash`. */
export function fixupMessage(hash: string): string {
  return `fixup! ${hash}`
}
