// Guided git bisect: the state of a bisect in progress, worked out from
// git's refs/bisect/* refs, and what the app says about it.

/** What a commit was marked as. Git's own words by default ("bad" / "good"), or the terms bisect was started with. */
export type BisectVerdict = 'bad' | 'good' | 'skip'

export interface BisectTerms {
  bad: string
  good: string
}

export const DEFAULT_TERMS: BisectTerms = { bad: 'bad', good: 'good' }

export interface BisectState {
  terms: BisectTerms
  /** The branch (or commit) bisect started from, which Reset goes back to. */
  startedFrom: string
  /** The commit marked bad, or null until one is. */
  bad: string | null
  good: string[]
  skipped: string[]
  /** HEAD: the commit to test now. */
  current: string | null
  /** "abc1234 Subject" for the current commit. */
  currentLabel: string | null
  /** Commits not yet tested that could still be the first bad one. */
  remaining: number
  /** About how many more tests it takes, counting the current one (git's own estimate). */
  stepsLeft: number
  /** The first bad commit, once bisect has found it. */
  firstBad: string | null
  /** "abc1234 Subject" for the first bad commit. */
  firstBadLabel: string | null
  /** When only skipped commits are left: the commits the first bad one is among. */
  suspects: string[]
}

/** Reads BISECT_TERMS ("bad\ngood", or e.g. "new\nold"). */
export function parseTerms(raw: string | null): BisectTerms {
  const [bad, good] = (raw ?? '').split('\n').map((l) => l.trim())
  return bad && good ? { bad, good } : DEFAULT_TERMS
}

/** Sorts refs/bisect/* refs ("<refname> <hash>" lines) into the bad, good and skipped commits. */
export function parseBisectRefs(
  lines: string,
  terms: BisectTerms
): { bad: string | null; good: string[]; skipped: string[] } {
  let bad: string | null = null
  const good: string[] = []
  const skipped: string[] = []
  for (const line of lines.split('\n')) {
    const [ref, hash] = line.trim().split(' ')
    if (!ref || !hash) continue
    const name = ref.replace(/^refs\/bisect\//, '')
    if (name === terms.bad) bad = hash
    else if (name.startsWith(`${terms.good}-`)) good.push(hash)
    else if (name.startsWith('skip-')) skipped.push(hash)
  }
  return { bad, good, skipped }
}

/**
 * Git's estimate of the tests left after the current one when `all` commits
 * could be the first bad one (estimate_bisect_steps in git's bisect.c).
 */
export function estimateSteps(all: number): number {
  if (all < 3) return 0
  const n = Math.floor(Math.log2(all))
  const e = 2 ** n
  const x = all - e
  return e < 3 * x ? n : n - 1
}

/**
 * Where a bisect has got to. `candidates` are the commits that could be the
 * first bad one: those reachable from the bad commit but from no good one,
 * the bad commit included (empty until both a bad and a good are marked).
 */
export function summarizeBisect({
  bad,
  good,
  skipped,
  candidates
}: {
  bad: string | null
  good: string[]
  skipped: string[]
  candidates: string[]
}): Pick<BisectState, 'remaining' | 'stepsLeft' | 'firstBad' | 'suspects'> {
  if (!bad || good.length === 0) return { remaining: 0, stepsLeft: 0, firstBad: null, suspects: [] }
  const skip = new Set(skipped)
  const untested = candidates.filter((c) => c !== bad && !skip.has(c))
  if (untested.length > 0) {
    return { remaining: untested.length, stepsLeft: estimateSteps(untested.length + 1) + 1, firstBad: null, suspects: [] }
  }
  if (candidates.length <= 1) return { remaining: 0, stepsLeft: 0, firstBad: bad, suspects: [] }
  return { remaining: 0, stepsLeft: 0, firstBad: null, suspects: candidates }
}

/** Whether bisect has stopped: found the first bad commit, or ran out of commits it may test. */
export function bisectFinished(state: BisectState): boolean {
  return !!state.firstBad || state.suspects.length > 0
}

/** What a commit is in the bisect, for its marker in the graph. */
export type BisectMark = 'first-bad' | 'bad' | 'good' | 'skip' | 'current'

/** Each marked commit's marker. The first bad commit wins over its plain bad mark. */
export function bisectMarks(state: BisectState | null): Map<string, BisectMark> {
  const marks = new Map<string, BisectMark>()
  if (!state) return marks
  for (const hash of state.good) marks.set(hash, 'good')
  for (const hash of state.skipped) marks.set(hash, 'skip')
  if (state.bad) marks.set(state.bad, 'bad')
  // Git only checks a commit out to test once it has both a bad and a good one.
  const testing = !!state.bad && state.good.length > 0 && !bisectFinished(state)
  if (testing && state.current && !marks.has(state.current)) marks.set(state.current, 'current')
  if (state.firstBad) marks.set(state.firstBad, 'first-bad')
  return marks
}

/** The words on a marker. */
export function markLabel(mark: BisectMark, terms: BisectTerms): string {
  switch (mark) {
    case 'first-bad':
      return `first ${terms.bad}`
    case 'bad':
      return terms.bad
    case 'good':
      return terms.good
    case 'skip':
      return 'skipped'
    case 'current':
      return 'testing'
  }
}

/** The banner's line about where the bisect has got to. */
export function bisectSummary(state: BisectState): string {
  const { terms } = state
  if (state.firstBad) return `Bisect found the first ${terms.bad} commit: ${state.firstBadLabel ?? state.firstBad.slice(0, 7)}`
  if (state.suspects.length > 0) {
    return `Only skipped commits are left: the first ${terms.bad} commit is one of ${state.suspects.length}`
  }
  if (!state.bad && state.good.length === 0) return `Bisecting: mark a ${terms.bad} commit and a ${terms.good} one`
  if (!state.bad) return `Bisecting: now mark a ${terms.bad} commit (right-click one in the graph)`
  if (state.good.length === 0) return `Bisecting: now mark a ${terms.good} commit (right-click an older one in the graph)`
  const left = `${state.remaining} ${state.remaining === 1 ? 'commit' : 'commits'} left`
  const steps = `about ${state.stepsLeft} ${state.stepsLeft === 1 ? 'step' : 'steps'}`
  return `Bisecting: test ${state.currentLabel ?? 'the checked-out commit'} · ${left}, ${steps}`
}

/**
 * The shell line that lets `command` decide each commit: `git bisect run`
 * treats exit 0 as good, 125 as skip, and 1 to 127 as bad.
 */
export function bisectRunScript(command: string): string {
  return `git bisect run sh -c '${command.replace(/'/g, `'\\''`)}'`
}
