import { ISSUE_KEY } from '../shared/issues'
import { JIRA_ISSUE_KEY } from '../shared/jira'
import type { IssueWorkOptions, StartIssueWorkResult } from '../shared/types'
import { GitError, runGit } from './gitExec'
import { createStackedBranch } from './stacks'

// "Start work" on a Launchpad issue: a branch for it, checked out, either
// fresh off the default branch or stacked on the branch already checked out.

async function revParse(repoPath: string, ref: string): Promise<string | null> {
  return (await runGit(repoPath, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]).catch(() => '')).trim() || null
}

async function currentBranch(repoPath: string): Promise<string | null> {
  return (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim() || null
}

/**
 * Where a fresh branch starts: origin's default branch as last fetched, else
 * a local main or master, else HEAD.
 */
async function defaultBase(repoPath: string): Promise<{ ref: string; trunk: string }> {
  const originHead = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']).catch(() => '')).trim()
  if (originHead && (await revParse(repoPath, originHead))) return { ref: originHead, trunk: originHead.replace(/^origin\//, '') }
  for (const trunk of ['main', 'master']) {
    if (await revParse(repoPath, `refs/remotes/origin/${trunk}`)) return { ref: `origin/${trunk}`, trunk }
    if (await revParse(repoPath, `refs/heads/${trunk}`)) return { ref: trunk, trunk }
  }
  return { ref: 'HEAD', trunk: (await currentBranch(repoPath)) ?? 'HEAD' }
}

/** What the Start work dialog offers for a repo. */
export async function issueWorkOptions(repoPath: string, branch: string): Promise<IssueWorkOptions> {
  const [current, base] = await Promise.all([currentBranch(repoPath), defaultBase(repoPath)])
  return {
    currentBranch: current,
    base: base.ref,
    // Stacking on the trunk is the same as starting fresh, so it isn't offered.
    canStack: !!current && current !== base.trunk && current !== branch,
    branchExists: !!(await revParse(repoPath, `refs/heads/${branch}`))
  }
}

/**
 * Creates `branch` for an issue and checks it out: stacked on the current
 * branch with `stack`, otherwise off the default branch. A branch that
 * already exists is just checked out, so starting work again picks up where
 * it was left. `issue` is a GitHub issue number or a Jira key ("PROJ-12").
 */
export async function startIssueWork(
  repoPath: string,
  issue: number | string,
  branch: string,
  stack: boolean
): Promise<StartIssueWorkResult> {
  const name = branch.trim()
  if (!name) throw new GitError('Give the branch a name.')
  await runGit(repoPath, ['check-ref-format', '--branch', name]).catch(() => {
    throw new GitError(`"${name}" isn't a valid branch name.`)
  })

  let created = true
  let stackedOn: string | null = null
  if (await revParse(repoPath, `refs/heads/${name}`)) {
    await runGit(repoPath, ['checkout', name])
    created = false
  } else if (stack) {
    const parent = await currentBranch(repoPath)
    if (!parent) throw new GitError('Check out a branch to stack the new one on.')
    await createStackedBranch(repoPath, parent, name)
    stackedOn = parent
  } else {
    // --no-track: the new branch shouldn't push to or pull from the trunk it started from.
    await runGit(repoPath, ['checkout', '--no-track', '-b', name, (await defaultBase(repoPath)).ref])
  }
  const configKey = typeof issue === 'number' ? ISSUE_KEY : JIRA_ISSUE_KEY
  await runGit(repoPath, ['config', `branch.${name}.${configKey}`, String(issue)])
  return { branch: name, created, stackedOn }
}

/**
 * The issue Start work recorded for `branch`. Only the recorded one: a name
 * like "2026-release" starts with a number that isn't an issue.
 */
export async function issueForBranch(repoPath: string, branch: string): Promise<number | null> {
  const recorded = Number((await runGit(repoPath, ['config', '--get', `branch.${branch}.${ISSUE_KEY}`]).catch(() => '')).trim())
  return Number.isSafeInteger(recorded) && recorded > 0 ? recorded : null
}

/** The Jira issue Start work recorded for `branch`, e.g. "PROJ-12". */
export async function jiraIssueForBranch(repoPath: string, branch: string): Promise<string | null> {
  const recorded = (await runGit(repoPath, ['config', '--get', `branch.${branch}.${JIRA_ISSUE_KEY}`]).catch(() => '')).trim()
  return /^[A-Z][A-Z0-9_]+-\d+$/.test(recorded) ? recorded : null
}
