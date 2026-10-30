import {
  forecastPairs,
  parseMergeTreeNames,
  type ConflictForecast,
  type ForecastTarget
} from '../shared/conflictForecast'
import { mergeBase } from './branches'
import { listBranches } from './git/refs'
import { GitError, runGit } from './gitExec'

// Early conflict warnings: a trial `git merge-tree` of each branch against
// where it's headed. Merging two commits always gives the same answer, so
// results are kept by tip pair and only new tips cost a merge.

const CACHE_LIMIT = 5000
const cache = new Map<string, string[]>()
const PARALLEL = 4

/**
 * The files that would conflict merging `a` and `b`, or [] when they merge
 * cleanly. Writes the trial tree's objects but no ref, index or file.
 */
export async function conflictingFiles(repoPath: string, a: string, b: string): Promise<string[]> {
  const key = `${repoPath}\0${[a, b].sort().join('\0')}`
  const known = cache.get(key)
  if (known) return known
  let files: string[]
  try {
    const out = await runGit(repoPath, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', a, b])
    files = parseMergeTreeNames(out).files
  } catch (err) {
    // Exit status 1 means "conflicts", with the tree and paths still printed.
    const parsed = parseMergeTreeNames(err instanceof GitError ? err.stdout : '')
    if (!parsed.tree || parsed.files.length === 0) throw err
    files = parsed.files
  }
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, files)
  return files
}

/**
 * Which local branches would conflict with the default branch or with the
 * current branch. Null when this git can't do a trial merge (before 2.38).
 */
export async function forecastConflicts(repoPath: string): Promise<ConflictForecast | null> {
  const [branches, base] = await Promise.all([listBranches(repoPath), mergeBase(repoPath)])
  let target: ForecastTarget | null = null
  if (base) {
    const hash = (await runGit(repoPath, ['rev-parse', '--verify', '-q', `${base.ref}^{commit}`]).catch(() => '')).trim()
    if (hash) target = { ...base, hash }
  }
  const pairs = forecastPairs(branches, target)
  const forecast: ConflictForecast = {}
  let unsupported = false
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < pairs.length && !unsupported) {
      const pair = pairs[next++]
      try {
        const files = await conflictingFiles(repoPath, pair.tip, pair.otherTip)
        if (files.length > 0) (forecast[pair.branch] ??= []).push({ with: pair.other, kind: pair.kind, files })
      } catch (err) {
        // Old git has no --write-tree; anything else (a shallow clone's missing
        // history, say) just means no warning for this pair.
        if (err instanceof GitError && /write-tree|usage: git merge-tree/i.test(err.message)) unsupported = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, pairs.length) }, worker))
  if (unsupported) return null
  // Target first, then current, whatever order the workers finished in.
  for (const warnings of Object.values(forecast)) warnings.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'target' ? -1 : 1))
  return forecast
}
