import {
  GIT_FLOW_KEYS,
  classifyGitFlowBranch,
  gitFlowBase,
  gitFlowConfigProblem,
  parseGitFlowConfig,
  type GitFlowConfig,
  type GitFlowFinishResult,
  type GitFlowKind
} from '../shared/gitflow'
import { getOperationState, runMayConflict } from './conflicts'
import { GitError, runGit } from './gitExec'

// git-flow in plain git (see shared/gitflow.ts). Finishing merges with
// --no-ff so each branch shows up as a merge commit, and is safe to run again
// after resolving a conflict: merges already made are no-ops and an existing
// tag is kept, so it carries on from where it stopped.

const NO_EDITOR = { GIT_EDITOR: 'true' }

/** The repo's git-flow settings, or null when git-flow isn't set up. */
export async function getGitFlowConfig(repoPath: string): Promise<GitFlowConfig | null> {
  const out = await runGit(repoPath, ['config', '--get-regexp', '^gitflow\\.']).catch(() => '')
  const values: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const space = line.indexOf(' ')
    if (space > 0) values[line.slice(0, space)] = line.slice(space + 1).trim()
    else if (line.trim()) values[line.trim()] = ''
  }
  return parseGitFlowConfig(values)
}

async function requireConfig(repoPath: string): Promise<GitFlowConfig> {
  const config = await getGitFlowConfig(repoPath)
  if (!config) throw new GitError('Set up git-flow for this repository first.')
  return config
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  return runGit(repoPath, ['rev-parse', '-q', '--verify', ref])
    .then(() => true)
    .catch(() => false)
}

const branchExists = (repoPath: string, name: string): Promise<boolean> => refExists(repoPath, `refs/heads/${name}`)

async function isAncestor(repoPath: string, ancestor: string, of: string): Promise<boolean> {
  return runGit(repoPath, ['merge-base', '--is-ancestor', ancestor, of])
    .then(() => true)
    .catch(() => false)
}

async function localBranches(repoPath: string): Promise<string[]> {
  const out = await runGit(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  return out.split('\n').filter(Boolean)
}

async function currentBranch(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
}

/**
 * Saves the settings and creates the development branch from production if
 * it doesn't exist yet. Leaves the checked-out branch alone.
 */
export async function initGitFlow(repoPath: string, config: GitFlowConfig): Promise<{ createdDevelop: boolean }> {
  const problem = gitFlowConfigProblem(config)
  if (problem) throw new GitError(problem)
  if (!(await branchExists(repoPath, config.master))) {
    throw new GitError(`There is no local branch called ${config.master} to use for production.`)
  }
  const createdDevelop = !(await branchExists(repoPath, config.develop))
  if (createdDevelop) await runGit(repoPath, ['branch', '--no-track', config.develop, config.master])
  await runGit(repoPath, ['config', GIT_FLOW_KEYS.master, config.master])
  await runGit(repoPath, ['config', GIT_FLOW_KEYS.develop, config.develop])
  for (const kind of ['feature', 'release', 'hotfix'] as const) {
    await runGit(repoPath, ['config', GIT_FLOW_KEYS[kind], config.prefixes[kind]])
  }
  await runGit(repoPath, ['config', GIT_FLOW_KEYS.versionTag, config.versionTag])
  return { createdDevelop }
}

/** The open release (or hotfix) branch, if there is one. git-flow allows one of each at a time. */
async function openBranchOf(repoPath: string, config: GitFlowConfig, kind: GitFlowKind): Promise<string | null> {
  return (await localBranches(repoPath)).find((b) => classifyGitFlowBranch(config, b)?.kind === kind) ?? null
}

/** Creates `<prefix><name>` from the kind's base branch and checks it out. Resolves to the new branch's name. */
export async function startGitFlowBranch(repoPath: string, kind: GitFlowKind, name: string): Promise<string> {
  const config = await requireConfig(repoPath)
  const trimmed = name.trim()
  if (!trimmed) throw new GitError(`The ${kind} needs a name.`)
  const base = gitFlowBase(config, kind)
  if (!(await branchExists(repoPath, base))) throw new GitError(`There is no local branch called ${base} to start from.`)
  if (kind !== 'feature') {
    const open = await openBranchOf(repoPath, config, kind)
    if (open) throw new GitError(`${open} is still open. Finish it before starting another ${kind}.`)
  }
  const branch = config.prefixes[kind] + trimmed
  await runGit(repoPath, ['checkout', '-b', branch, base])
  return branch
}

/** Merges `branch` into `target` with a merge commit, checking `target` out first. */
async function mergeInto(repoPath: string, target: string, branch: string): Promise<boolean> {
  if ((await currentBranch(repoPath)) !== target) await runGit(repoPath, ['checkout', '-q', target])
  const result = await runMayConflict(repoPath, ['merge', '--no-ff', '--no-edit', branch], NO_EDITOR)
  return result.conflicts
}

/**
 * Finishes a feature (merged into develop), release (into production, tagged,
 * then into develop) or hotfix (into production, tagged, then into the open
 * release if there is one, else develop), then deletes it. It ends on the
 * last branch merged into. A conflict stops it there, mid-merge, for the
 * conflict view; finishing again once that merge is committed carries on.
 */
export async function finishGitFlowBranch(
  repoPath: string,
  branch: string,
  tagMessage?: string
): Promise<GitFlowFinishResult> {
  const config = await requireConfig(repoPath)
  const flow = classifyGitFlowBranch(config, branch)
  if (!flow) throw new GitError(`${branch} isn't a git-flow feature, release or hotfix branch.`)
  if (!(await branchExists(repoPath, branch))) throw new GitError(`There is no local branch called ${branch}.`)
  if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
  const dirty = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=no'])).trim().length > 0
  if (dirty) throw new GitError('Commit or stash your changes before finishing.')

  const tagged = flow.kind !== 'feature'
  let afterProduction = config.develop
  if (flow.kind === 'hotfix') afterProduction = (await openBranchOf(repoPath, config, 'release')) ?? config.develop
  const targets = tagged ? [config.master, afterProduction] : [config.develop]
  for (const target of targets) {
    if (!(await branchExists(repoPath, target))) throw new GitError(`There is no local branch called ${target}.`)
  }

  const tag = tagged ? config.versionTag + flow.name : null
  const tagExists = tag !== null && (await refExists(repoPath, `refs/tags/${tag}`))
  // An existing tag is ours from an earlier, interrupted finish only once the branch is in production.
  if (tagExists && !(await isAncestor(repoPath, branch, config.master))) {
    throw new GitError(`A tag called ${tag} already exists.`)
  }
  for (const target of targets) {
    if (await mergeInto(repoPath, target, branch)) {
      return { mergedInto: targets.slice(0, targets.indexOf(target)), tag: null, conflictsIn: target, deleted: false }
    }
    if (tag && !tagExists && target === config.master) {
      await runGit(repoPath, ['tag', '-a', tag, '-m', tagMessage?.trim() || tag, config.master])
    }
  }
  await runGit(repoPath, ['branch', '-d', branch])
  return { mergedInto: targets, tag, conflictsIn: null, deleted: true }
}
