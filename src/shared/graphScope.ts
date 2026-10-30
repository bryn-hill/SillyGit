// Which branches the commit graph draws: all of them less any hidden ones,
// one soloed branch, or just the checked-out branch. Saved per repo.

/** A branch as the menus name it: `feat`, or `origin/feat` with `remote` set. */
export interface ScopedBranch {
  name: string
  remote: boolean
}

export interface GraphScope {
  /** Left out of the graph. Hiding a local branch hides its remote copies too. */
  hidden: ScopedBranch[]
  /** When set, the graph shows only this branch and its upstream. Wins over `currentOnly`. */
  solo: ScopedBranch | null
  /** Only the checked-out branch and its upstream. */
  currentOnly: boolean
}

export const DEFAULT_GRAPH_SCOPE: GraphScope = { hidden: [], solo: null, currentOnly: false }

function normalizeBranch(value: unknown): ScopedBranch | null {
  if (!value || typeof value !== 'object') return null
  const { name, remote } = value as Partial<ScopedBranch>
  return typeof name === 'string' && name ? { name, remote: remote === true } : null
}

export function normalizeGraphScope(value: unknown): GraphScope {
  if (!value || typeof value !== 'object') return DEFAULT_GRAPH_SCOPE
  const raw = value as Partial<Record<keyof GraphScope, unknown>>
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.map(normalizeBranch).filter((b) => b !== null) : []
  return {
    hidden: hidden.filter((b, i) => hidden.findIndex((o) => sameBranch(o, b)) === i),
    solo: normalizeBranch(raw.solo),
    currentOnly: raw.currentOnly === true
  }
}

export function isDefaultScope(scope: GraphScope): boolean {
  return scope.hidden.length === 0 && !scope.solo && !scope.currentOnly
}

export function sameBranch(a: ScopedBranch, b: ScopedBranch): boolean {
  return a.name === b.name && a.remote === b.remote
}

export function isHidden(scope: GraphScope, branch: ScopedBranch): boolean {
  return scope.hidden.some((b) => sameBranch(b, branch))
}

export function isSolo(scope: GraphScope, branch: ScopedBranch): boolean {
  return !!scope.solo && sameBranch(scope.solo, branch)
}

/** Hides a branch, or shows it again. Soloing a branch you hide stops the solo. */
export function toggleHidden(scope: GraphScope, branch: ScopedBranch): GraphScope {
  if (isHidden(scope, branch)) return { ...scope, hidden: scope.hidden.filter((b) => !sameBranch(b, branch)) }
  return {
    ...scope,
    hidden: [...scope.hidden, { name: branch.name, remote: branch.remote }],
    solo: isSolo(scope, branch) ? null : scope.solo
  }
}

/** Solos a branch (unhiding it, and leaving "current branch only"), or stops soloing it. */
export function toggleSolo(scope: GraphScope, branch: ScopedBranch): GraphScope {
  if (isSolo(scope, branch)) return { ...scope, solo: null }
  return {
    ...scope,
    currentOnly: false,
    solo: { name: branch.name, remote: branch.remote },
    hidden: scope.hidden.filter((b) => !sameBranch(b, branch))
  }
}

/** Turns "current branch only" on or off; turning it on ends any solo. */
export function toggleCurrentOnly(scope: GraphScope): GraphScope {
  return { ...scope, currentOnly: !scope.currentOnly, solo: null }
}

/** What the graph's scope bar says, or null when it shows everything. */
export function graphScopeLabel(scope: GraphScope): string | null {
  if (scope.solo) return `Only ${scope.solo.name}`
  if (scope.currentOnly) return 'Current branch only'
  const n = scope.hidden.length
  if (n === 1) return `${scope.hidden[0].name} hidden`
  if (n > 1) return `${n} branches hidden`
  return null
}

/** A ref in the repo and the upstream it tracks, if any (`git for-each-ref`). */
export interface RepoRef {
  refname: string
  upstream: string
}

// Refs the graph never draws: stashes have their own list, and the lanes'
// backups and set-aside changes would only clutter it.
const ALWAYS_EXCLUDED = ['refs/stash', 'refs/sillygit/*']

/** Escapes a ref name for git's `--exclude` glob, so it only matches itself. */
function literalGlob(ref: string): string {
  return ref.replace(/[\\*?[]/g, (c) => `\\${c}`)
}

function fullRef(branch: ScopedBranch): string {
  return branch.remote ? `refs/remotes/${branch.name}` : `refs/heads/${branch.name}`
}

/** The ref and every remote copy of it: `refs/heads/x` and `refs/remotes/<remote>/x`. */
function refsOf(branch: ScopedBranch, remotes: string[]): string[] {
  const refs = [fullRef(branch)]
  if (!branch.remote) refs.push(...remotes.map((r) => `refs/remotes/${r}/${branch.name}`))
  return refs
}

/**
 * The revisions `git log` draws for a scope: `--all` less the hidden branches,
 * or the soloed (or current) branch and its upstream. A soloed branch that no
 * longer exists falls back to showing everything, so the graph is never empty
 * because of a stale setting.
 */
export function graphRevisionArgs(
  scope: GraphScope,
  refs: RepoRef[],
  remotes: string[],
  currentBranch: string | null
): string[] {
  const existing = new Map(refs.map((r) => [r.refname, r.upstream]))
  const withUpstream = (refname: string): string[] => {
    const upstream = existing.get(refname)
    return upstream && existing.has(upstream) ? [refname, upstream] : [refname]
  }
  if (scope.solo && existing.has(fullRef(scope.solo))) return withUpstream(fullRef(scope.solo))
  if (scope.currentOnly) return currentBranch ? ['HEAD', ...withUpstream(`refs/heads/${currentBranch}`).slice(1)] : ['HEAD']
  const hidden = scope.hidden.flatMap((b) => refsOf(b, remotes))
  return [...[...ALWAYS_EXCLUDED, ...hidden.map(literalGlob)].map((ref) => `--exclude=${ref}`), '--all']
}
