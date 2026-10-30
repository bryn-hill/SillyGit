// git-flow without the git-flow binary. The branch names and prefixes live in
// the repo's git config under the same gitflow.* keys git-flow (AVH edition)
// uses, so a repo set up here works with the command-line tool and the other
// way round.

/** The kinds of branch SillyGit can start and finish. */
export type GitFlowKind = 'feature' | 'release' | 'hotfix'

export const GIT_FLOW_KINDS: readonly GitFlowKind[] = ['feature', 'release', 'hotfix']

export interface GitFlowConfig {
  /** The production branch, git-flow's "master" (gitflow.branch.master). */
  master: string
  /** The integration branch (gitflow.branch.develop). */
  develop: string
  /** Branch name prefixes, e.g. "feature/" (gitflow.prefix.<kind>). */
  prefixes: Record<GitFlowKind, string>
  /** Put in front of a release or hotfix name to make its tag, e.g. "v" (gitflow.prefix.versiontag). Often empty. */
  versionTag: string
}

/** git config key for each setting. */
export const GIT_FLOW_KEYS = {
  master: 'gitflow.branch.master',
  develop: 'gitflow.branch.develop',
  feature: 'gitflow.prefix.feature',
  release: 'gitflow.prefix.release',
  hotfix: 'gitflow.prefix.hotfix',
  versionTag: 'gitflow.prefix.versiontag'
} as const

/** git-flow's own defaults, with the production branch the repo already has (main or master). */
export function defaultGitFlowConfig(localBranches: string[]): GitFlowConfig {
  const master = localBranches.includes('main') ? 'main' : localBranches.includes('master') ? 'master' : 'main'
  return {
    master,
    develop: 'develop',
    prefixes: { feature: 'feature/', release: 'release/', hotfix: 'hotfix/' },
    versionTag: ''
  }
}

/** Reads a config from `gitflow.*` values; null until both branches are set (git-flow's "initialized"). */
export function parseGitFlowConfig(values: Record<string, string>): GitFlowConfig | null {
  const master = values[GIT_FLOW_KEYS.master]
  const develop = values[GIT_FLOW_KEYS.develop]
  if (!master || !develop) return null
  return {
    master,
    develop,
    prefixes: {
      feature: values[GIT_FLOW_KEYS.feature] ?? 'feature/',
      release: values[GIT_FLOW_KEYS.release] ?? 'release/',
      hotfix: values[GIT_FLOW_KEYS.hotfix] ?? 'hotfix/'
    },
    versionTag: values[GIT_FLOW_KEYS.versionTag] ?? ''
  }
}

/** Why a config can't be saved, or null when it's fine. */
export function gitFlowConfigProblem(config: GitFlowConfig): string | null {
  if (!config.master.trim() || !config.develop.trim()) return 'Both the production and development branch need a name.'
  if (config.master === config.develop) return 'The production and development branches must be different.'
  const prefixes = GIT_FLOW_KINDS.map((k) => config.prefixes[k])
  if (prefixes.some((p) => !p.trim())) return 'Every branch prefix needs a value, e.g. feature/.'
  if (new Set(prefixes).size !== prefixes.length) return 'Each kind of branch needs its own prefix.'
  return null
}

/** A git-flow branch: its kind and its name without the prefix. */
export interface GitFlowBranch {
  kind: GitFlowKind
  name: string
}

/** What kind of git-flow branch `branch` is, from its prefix. */
export function classifyGitFlowBranch(config: GitFlowConfig, branch: string): GitFlowBranch | null {
  for (const kind of GIT_FLOW_KINDS) {
    const prefix = config.prefixes[kind]
    if (prefix && branch.startsWith(prefix) && branch.length > prefix.length) {
      return { kind, name: branch.slice(prefix.length) }
    }
  }
  return null
}

/** The branch a kind starts from: features and releases from develop, hotfixes from production. */
export function gitFlowBase(config: GitFlowConfig, kind: GitFlowKind): string {
  return kind === 'hotfix' ? config.master : config.develop
}

/** What finishing a branch did. */
export interface GitFlowFinishResult {
  /** Branches it merged into, in order. */
  mergedInto: string[]
  /** The tag it made (releases and hotfixes), or null. */
  tag: string | null
  /** It stopped with conflicts merging into this branch, which is now checked out mid-merge. */
  conflictsIn: string | null
  deleted: boolean
}
