// Updating SillyGit itself: it runs from a git checkout of its own repo, so
// an update is a fast-forward of that checkout to origin/main, an npm
// install when the dependencies changed, a rebuild and a restart.

/** The branch SillyGit updates from, on the checkout's `origin` remote. */
export const UPDATE_BRANCH = 'main'

export interface IncomingCommit {
  hash: string
  subject: string
}

export interface SelfUpdateStatus {
  /** False when SillyGit isn't running from a git checkout (a packaged build), so there's nothing to update. */
  supported: boolean
  /** The checkout SillyGit runs from. */
  root: string | null
  /** The branch the checkout is on, null when detached. */
  branch: string | null
  /** Commits on origin/main the checkout doesn't have yet. */
  behind: number
  /** Commits on the checkout's branch that aren't on origin/main. */
  ahead: number
  /** The newest commits an update brings in, newest first (at most INCOMING_LIMIT). */
  incoming: IncomingCommit[]
  /** Whether the checkout has uncommitted changes to tracked files. */
  dirty: boolean
  /** Why Update can't run, e.g. the checkout is on another branch; null when it can. */
  blocked: string | null
  /** When origin was last fetched, ms since the epoch. */
  checkedAt: number | null
  /** Why the last check failed, e.g. offline. */
  error: string | null
}

export const INCOMING_LIMIT = 20

/** The status before anything is known, and for builds that can't update themselves. */
export const NO_SELF_UPDATE: SelfUpdateStatus = {
  supported: false,
  root: null,
  branch: null,
  behind: 0,
  ahead: 0,
  incoming: [],
  dirty: false,
  blocked: null,
  checkedAt: null,
  error: null
}

export type SelfUpdateStep = 'fetching' | 'pulling' | 'installing' | 'building' | 'restarting'

export const STEP_LABELS: Record<SelfUpdateStep, string> = {
  fetching: 'Fetching the latest main…',
  pulling: 'Pulling the latest main…',
  installing: 'Installing dependencies (npm install)…',
  building: 'Building SillyGit…',
  restarting: 'Restarting…'
}

export interface SelfUpdateResult {
  /** Whether new commits came in; false when it was already up to date. */
  updated: boolean
  /** Whether npm install ran because package.json or the lockfile changed. */
  installed: boolean
  /** Set when local changes couldn't be put back on top of the update and were left in this stash instead. */
  stashedChanges: string | null
}

/** Whether a change to these files means node_modules needs an npm install. */
export function needsInstall(changedFiles: string[]): boolean {
  return changedFiles.some((f) => f === 'package.json' || f === 'package-lock.json')
}

/** Why the checkout can't be fast-forwarded to origin/main, or null when it can. */
export function blockedReason(branch: string | null, ahead: number): string | null {
  if (branch !== UPDATE_BRANCH) {
    return branch
      ? `SillyGit's checkout is on the branch ${branch}. Check out ${UPDATE_BRANCH} there to update.`
      : `SillyGit's checkout isn't on a branch. Check out ${UPDATE_BRANCH} there to update.`
  }
  if (ahead > 0) {
    return `SillyGit's ${UPDATE_BRANCH} has ${ahead} ${ahead === 1 ? "commit that isn't" : "commits that aren't"} on origin/${UPDATE_BRANCH}, so it can't fast-forward. Push or reset them first.`
  }
  return null
}
