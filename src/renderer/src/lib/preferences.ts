import type { PullMode } from '../../../shared/types'
import type { RunMode } from '../../../shared/run'
import type { PrMergeMethod } from '../../../shared/mergeOptions'

// Small per-machine choices kept in localStorage. Storage can be unavailable,
// so reads fall back to the default and failed writes are ignored.

const PULL_MODE_KEY = 'sillygit.pullMode'
const RUN_MODE_KEY = 'sillygit.runMode'

export function loadPullMode(): PullMode {
  try {
    const saved = localStorage.getItem(PULL_MODE_KEY)
    if (saved === 'ff' || saved === 'ff-only' || saved === 'rebase') return saved
  } catch {
    // Fall back to the default.
  }
  return 'ff'
}

export function savePullMode(mode: PullMode): void {
  try {
    localStorage.setItem(PULL_MODE_KEY, mode)
  } catch {
    // Not remembering it is fine.
  }
}

export function loadRunMode(): RunMode {
  try {
    if (localStorage.getItem(RUN_MODE_KEY) === 'checkout') return 'checkout'
  } catch {
    // Fall back to the default.
  }
  return 'isolated'
}

export function saveRunMode(mode: RunMode): void {
  try {
    localStorage.setItem(RUN_MODE_KEY, mode)
  } catch {
    // Not remembering it is fine.
  }
}

const PR_MERGE_METHOD_KEY = 'sillygit.prMergeMethod'

/** The merge method last used for a pull request in `repoPath`. */
export function loadPrMergeMethod(repoPath: string): PrMergeMethod | null {
  try {
    const saved = (JSON.parse(localStorage.getItem(PR_MERGE_METHOD_KEY) ?? '{}') as Record<string, unknown>)[repoPath]
    if (saved === 'merge' || saved === 'squash' || saved === 'rebase') return saved
  } catch {
    // Fall back to the repository's first allowed method.
  }
  return null
}

export function savePrMergeMethod(repoPath: string, method: PrMergeMethod): void {
  try {
    const saved = JSON.parse(localStorage.getItem(PR_MERGE_METHOD_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(PR_MERGE_METHOD_KEY, JSON.stringify({ ...saved, [repoPath]: method }))
  } catch {
    // Not remembering it is fine.
  }
}
