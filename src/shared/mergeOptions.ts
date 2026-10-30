import type { ConflictableResult } from './types'

// How a local merge joins two branches, and how a pull request is merged on
// its host. Local merges pick a strategy from the branch and drop menus; pull
// requests pick a method in Launchpad, limited to what the repository allows.

/** `default` is git's own choice: fast-forward when it can, otherwise a merge commit. */
export type MergeStrategy = 'default' | 'no-ff' | 'ff-only' | 'squash'

/** The strategies offered besides the default, in menu order. */
export const MERGE_STRATEGY_CHOICES: { strategy: Exclude<MergeStrategy, 'default'>; label: string; hint: string }[] = [
  { strategy: 'no-ff', label: 'Always create a merge commit', hint: 'git merge --no-ff' },
  { strategy: 'ff-only', label: 'Fast-forward only', hint: 'git merge --ff-only' },
  { strategy: 'squash', label: 'Squash into one commit', hint: 'git merge --squash' }
]

/** The `git merge` arguments that merge `branch` into the checked-out branch with `strategy`. */
export function mergeArgs(branch: string, strategy: MergeStrategy = 'default'): string[] {
  switch (strategy) {
    case 'no-ff':
      return ['merge', '--no-ff', '--no-edit', branch]
    case 'ff-only':
      return ['merge', '--ff-only', branch]
    case 'squash':
      return ['merge', '--squash', branch]
    default:
      return ['merge', '--no-edit', branch]
  }
}

/**
 * What a local merge did. A squash stages the branch's changes without
 * committing them, so `squashed` asks for a commit, with `message` to start
 * from; `nothingToSquash` when the branch had no changes to bring in.
 */
export interface MergeResult extends ConflictableResult {
  squashed?: boolean
  message?: string
  nothingToSquash?: boolean
}

/** The commit message a squash merge starts from. */
export function squashMessage(branch: string): string {
  return `Squash merge branch '${branch}'`
}

/** How a pull request is merged on its host. */
export type PrMergeMethod = 'merge' | 'squash' | 'rebase'

export const PR_MERGE_METHODS: PrMergeMethod[] = ['merge', 'squash', 'rebase']

export const PR_MERGE_METHOD_LABELS: Record<PrMergeMethod, { label: string; hint: string }> = {
  merge: { label: 'Create a merge commit', hint: 'Every commit is kept and a merge commit joins them.' },
  squash: { label: 'Squash and merge', hint: 'The commits become one commit on the base branch.' },
  rebase: { label: 'Rebase and merge', hint: 'The commits are replayed onto the base branch, without a merge commit.' }
}

/** The methods a repository allows for a pull request, in PR_MERGE_METHODS order. */
export interface PrMergeMethods {
  allowed: PrMergeMethod[]
  /** False when the host didn't say, so every method is offered and the host decides. */
  known: boolean
}

const ALL_METHODS: PrMergeMethods = { allowed: PR_MERGE_METHODS, known: false }

/**
 * The methods from GitHub's repository settings. GitHub leaves the
 * `allow_*` fields out for people who can't change them; then every method is
 * offered.
 */
export function githubMergeMethods(repo: {
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
}): PrMergeMethods {
  const flags: Record<PrMergeMethod, boolean | undefined> = {
    merge: repo.allow_merge_commit,
    squash: repo.allow_squash_merge,
    rebase: repo.allow_rebase_merge
  }
  if (PR_MERGE_METHODS.every((m) => flags[m] === undefined)) return ALL_METHODS
  const allowed = PR_MERGE_METHODS.filter((m) => flags[m] !== false)
  return allowed.length ? { allowed, known: true } : ALL_METHODS
}

/** Azure DevOps' "Require a merge strategy" branch policy. */
export const AZURE_MERGE_STRATEGY_POLICY = 'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab'

/** What Azure DevOps calls each method when completing a pull request. */
export const AZURE_MERGE_STRATEGY: Record<PrMergeMethod, string> = {
  merge: 'noFastForward',
  squash: 'squash',
  rebase: 'rebase'
}

export interface AzurePolicyConfiguration {
  isEnabled?: boolean
  isDeleted?: boolean
  type?: { id?: string }
  settings?: {
    allowNoFastForward?: boolean
    allowSquash?: boolean
    allowRebase?: boolean
    allowRebaseMerge?: boolean
    /** The policy's older form: squash only when true. */
    useSquashMerge?: boolean
    scope?: { repositoryId?: string | null; refName?: string; matchKind?: string }[]
  }
}

/**
 * The methods Azure DevOps allows into `targetRef` (refs/heads/...) of the
 * repository `repositoryId`: those every enabled merge strategy policy on that
 * branch allows. No policy means any method.
 */
export function azureMergeMethods(
  policies: AzurePolicyConfiguration[],
  repositoryId: string | undefined,
  targetRef: string
): PrMergeMethods {
  const applies = (p: AzurePolicyConfiguration): boolean =>
    !!p.isEnabled &&
    !p.isDeleted &&
    p.type?.id === AZURE_MERGE_STRATEGY_POLICY &&
    (p.settings?.scope ?? [{}]).some(
      (s) =>
        (!s.repositoryId || s.repositoryId === repositoryId) &&
        (!s.refName ||
          (s.matchKind?.toLowerCase() === 'prefix' ? targetRef.startsWith(s.refName) : s.refName === targetRef))
    )
  const rules = policies.filter(applies)
  if (!rules.length) return ALL_METHODS
  const allows = (m: PrMergeMethod): boolean =>
    rules.every(({ settings: s = {} }) => {
      const legacy = s.allowNoFastForward === undefined && s.allowSquash === undefined && s.allowRebase === undefined
      if (legacy) return s.useSquashMerge ? m === 'squash' : m === 'merge'
      return m === 'merge' ? !!s.allowNoFastForward : m === 'squash' ? !!s.allowSquash : !!s.allowRebase
    })
  const allowed = PR_MERGE_METHODS.filter(allows)
  return allowed.length ? { allowed, known: true } : ALL_METHODS
}

/** The method to start on: the one used last when it's still allowed, else the first allowed. */
export function initialMergeMethod(methods: PrMergeMethods, last?: PrMergeMethod | null): PrMergeMethod {
  return last && methods.allowed.includes(last) ? last : methods.allowed[0]
}
