import { parseStatusSummary, type RepoOverviewEntry } from '../../shared/repoOverview'
import { runGit } from '../gitExec'

// The repository overview's per-repo state.

// Enough to keep a long list moving without starting dozens of git processes at once.
const MAX_PARALLEL = 6

async function summarize(repoPath: string): Promise<RepoOverviewEntry> {
  try {
    const out = await runGit(repoPath, ['status', '--porcelain=v2', '--branch', '--untracked-files=normal'])
    return { path: repoPath, ok: true, summary: parseStatusSummary(repoPath, out) }
  } catch (err) {
    return { path: repoPath, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Each repo's branch, ahead/behind and change counts, in the order given. One failing repo doesn't fail the rest. */
export async function repoOverview(repoPaths: string[]): Promise<RepoOverviewEntry[]> {
  const results: RepoOverviewEntry[] = new Array(repoPaths.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < repoPaths.length) {
      const i = next++
      results[i] = await summarize(repoPaths[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, repoPaths.length) }, worker))
  return results
}
