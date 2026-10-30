import { BASE_KEY, PARENT_KEY, groupStacks, wouldLoop, type RestackResult, type StackInfo } from '../shared/stacks'
import { getOperationState, runMayConflict } from './conflicts'
import { GitError, remoteEnv, runGit } from './gitExec'

// Stacked branches (see shared/stacks.ts). Restacking rebases each branch in
// a stack onto its parent's tip, bottom up, replaying only the commits made
// since the parent's tip it was last based on. That base is remembered, so a
// parent that was squash-merged and deleted doesn't drag its old commits
// along when its children move down onto the trunk.

const NO_EDITOR = { GIT_EDITOR: 'true' }
const STASH_MESSAGE = 'SillyGit: set aside to restack'

async function config(repoPath: string, key: string): Promise<string | null> {
  const out = await runGit(repoPath, ['config', '--get', key]).catch(() => '')
  return out.trim() || null
}

async function setConfig(repoPath: string, key: string, value: string | null): Promise<void> {
  if (value === null) await runGit(repoPath, ['config', '--unset', key]).catch(() => {})
  else await runGit(repoPath, ['config', key, value])
}

/** Every branch with a parent, by name. */
export async function stackParents(repoPath: string): Promise<Record<string, string>> {
  const out = await runGit(repoPath, ['config', '--get-regexp', `^branch\\..*\\.${PARENT_KEY}$`]).catch(() => '')
  const parents: Record<string, string> = {}
  const suffix = `.${PARENT_KEY}`
  for (const line of out.split('\n')) {
    const space = line.indexOf(' ')
    if (space < 0) continue
    const key = line.slice(0, space)
    if (!key.startsWith('branch.') || !key.endsWith(suffix)) continue
    parents[key.slice('branch.'.length, -suffix.length)] = line.slice(space + 1).trim()
  }
  return parents
}

async function localBranches(repoPath: string): Promise<Map<string, string>> {
  const out = await runGit(repoPath, ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads'])
  const tips = new Map<string, string>()
  for (const line of out.split('\n')) {
    const [name, hash] = line.split('\t')
    if (name && hash) tips.set(name, hash)
  }
  return tips
}

async function isAncestor(repoPath: string, ancestor: string, of: string): Promise<boolean> {
  return runGit(repoPath, ['merge-base', '--is-ancestor', ancestor, of])
    .then(() => true)
    .catch(() => false)
}

async function count(repoPath: string, range: string): Promise<number> {
  return Number((await runGit(repoPath, ['rev-list', '--count', range]).catch(() => '0')).trim()) || 0
}

/** The repo's stacks, with which branches need restacking. */
export async function listStacks(repoPath: string): Promise<StackInfo[]> {
  const parents = await stackParents(repoPath)
  if (Object.keys(parents).length === 0) return []
  const tips = await localBranches(repoPath)
  const groups = groupStacks(parents, new Set(tips.keys()))
  return Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      trunk: g.trunk,
      branches: await Promise.all(
        g.nodes.map(async (n) => {
          const parentTip = tips.get(n.parent)
          const tip = tips.get(n.name)!
          return {
            ...n,
            parentMissing: !parentTip,
            needsRestack: !!parentTip && !(await isAncestor(repoPath, parentTip, tip)),
            ahead: parentTip ? await count(repoPath, `${parentTip}..${tip}`) : 0
          }
        })
      )
    }))
  )
}

async function requireBranch(repoPath: string, name: string): Promise<string> {
  const hash = (await runGit(repoPath, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]).catch(() => '')).trim()
  if (!hash) throw new GitError(`There is no local branch called ${name}.`)
  return hash
}

/**
 * Makes `parent` the branch `branch` is stacked on, or takes it out of its
 * stack when `parent` is null. Its base becomes where the two meet.
 */
export async function setStackParent(repoPath: string, branch: string, parent: string | null): Promise<void> {
  const tip = await requireBranch(repoPath, branch)
  if (parent === null) {
    await setConfig(repoPath, `branch.${branch}.${PARENT_KEY}`, null)
    await setConfig(repoPath, `branch.${branch}.${BASE_KEY}`, null)
    return
  }
  if (parent === branch) throw new GitError('A branch can’t be stacked on itself.')
  const parentTip = await requireBranch(repoPath, parent)
  if (wouldLoop(await stackParents(repoPath), branch, parent)) {
    throw new GitError(`${parent} is already stacked on ${branch}.`)
  }
  const base = (await runGit(repoPath, ['merge-base', parentTip, tip]).catch(() => '')).trim()
  if (!base) throw new GitError(`${branch} and ${parent} have no history in common.`)
  await setConfig(repoPath, `branch.${branch}.${PARENT_KEY}`, parent)
  await setConfig(repoPath, `branch.${branch}.${BASE_KEY}`, base)
}

/** Creates `name` at `parent`'s tip, stacked on it, and checks it out. */
export async function createStackedBranch(repoPath: string, parent: string, name: string): Promise<void> {
  const parentTip = await requireBranch(repoPath, parent)
  await runGit(repoPath, ['checkout', '-b', name, parent])
  await setConfig(repoPath, `branch.${name}.${PARENT_KEY}`, parent)
  await setConfig(repoPath, `branch.${name}.${BASE_KEY}`, parentTip)
}

/**
 * After `name` is deleted: its children move down onto its own parent (or
 * leave the stack when it had none), keeping their bases so they replay only
 * their own commits when next restacked. `parents` is from before the delete,
 * which takes the branch's own config with it.
 */
export async function reparentChildren(repoPath: string, name: string, parents: Record<string, string>): Promise<void> {
  const grandparent = parents[name] ?? null
  for (const [child, parent] of Object.entries(parents)) {
    if (parent !== name) continue
    await setConfig(repoPath, `branch.${child}.${PARENT_KEY}`, grandparent)
    if (grandparent === null) await setConfig(repoPath, `branch.${child}.${BASE_KEY}`, null)
  }
}

/** After a rename (git moves the branch's own config): its children follow it. */
export async function renameParent(repoPath: string, from: string, to: string): Promise<void> {
  const parents = await stackParents(repoPath)
  for (const [child, parent] of Object.entries(parents)) {
    if (parent === from) await setConfig(repoPath, `branch.${child}.${PARENT_KEY}`, to)
  }
}

/** The commit to replay `branch`'s own commits from: its remembered base, else where it meets its parent. */
async function replayFrom(repoPath: string, branch: string, tip: string, parentTip: string): Promise<string> {
  const base = await config(repoPath, `branch.${branch}.${BASE_KEY}`)
  if (base && (await isAncestor(repoPath, base, tip))) return base
  return (await runGit(repoPath, ['merge-base', parentTip, tip])).trim()
}

/**
 * Rebases every branch in `branch`'s stack onto its parent's tip, parents
 * first, then goes back to the branch that was checked out. Uncommitted
 * changes are stashed first and put back after. A conflict stops it there,
 * in the rebase, for the usual conflict view; restacking again once it's
 * resolved carries on with the branches after it.
 */
export async function restack(repoPath: string, branch: string): Promise<RestackResult> {
  if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
  const stack = (await listStacks(repoPath)).find((s) => s.branches.some((b) => b.name === branch))
  if (!stack) throw new GitError(`${branch} isn't in a stack.`)
  const missing = stack.branches.find((b) => b.parentMissing)
  if (missing) throw new GitError(`${missing.name}'s parent ${missing.parent} is gone. Pick a new parent for it first.`)

  const original =
    (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim() ||
    (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
  const dirty = (await runGit(repoPath, ['status', '--porcelain', '--untracked-files=no'])).trim().length > 0
  if (dirty) await runGit(repoPath, ['stash', 'push', '-m', STASH_MESSAGE])

  const restacked: string[] = []
  for (const b of stack.branches) {
    const parentTip = await requireBranch(repoPath, b.parent)
    const tip = await requireBranch(repoPath, b.name)
    if (!(await isAncestor(repoPath, parentTip, tip))) {
      const from = await replayFrom(repoPath, b.name, tip, parentTip)
      const result = await runMayConflict(repoPath, ['rebase', '--onto', parentTip, from, b.name], NO_EDITOR)
      if (result.conflicts) {
        // The rebase finishing records the new base when this runs again.
        return { restacked, conflicts: true, stoppedAt: b.name, stashed: dirty }
      }
      restacked.push(b.name)
    }
    await setConfig(repoPath, `branch.${b.name}.${BASE_KEY}`, parentTip)
  }

  const now = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
  if (now !== original) await runGit(repoPath, ['checkout', '-q', original])
  if (dirty) await runGit(repoPath, ['stash', 'pop'])
  return { restacked, conflicts: false, stoppedAt: null, stashed: false }
}

/**
 * Pushes every branch in the stack to `remote` in one go, with
 * --force-with-lease since restacking rewrites them, setting up tracking for
 * any that don't have it yet.
 */
export async function pushStack(repoPath: string, branch: string): Promise<{ remote: string; pushed: string[] }> {
  const stack = (await listStacks(repoPath)).find((s) => s.branches.some((b) => b.name === branch))
  if (!stack) throw new GitError(`${branch} isn't in a stack.`)
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
  if (remotes.length === 0) throw new GitError('This repository has no remote to push to.')
  const tracked = await config(repoPath, `branch.${stack.id}.remote`)
  const remote = tracked && remotes.includes(tracked) ? tracked : remotes.includes('origin') ? 'origin' : remotes[0]
  const names = stack.branches.map((b) => b.name)
  await runGit(repoPath, ['push', '-u', '--force-with-lease', remote, ...names], await remoteEnv())
  return { remote, pushed: names }
}
