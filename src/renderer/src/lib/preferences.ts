import type { PullMode } from '../../../shared/types'
import type { RunMode } from '../../../shared/run'

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
