import { useEffect, useRef, useState } from 'react'
import { WORKSPACE_BRANCH, type LaneMove, type LanesStatus } from '../../../shared/lanes'
import type { PromptRequest } from '../components/PromptDialog'
import type { Repo } from './useRepo'
import type { GitRunner } from './useGitRunner'
import { cacheKey, writeCached } from '../lib/swrCache'
import { useCached } from './useCached'

/**
 * Lanes (virtual branches): the repo's lanes status, reloaded on every repo
 * refresh, and the actions on them. Every action goes through the git runner,
 * which refreshes the repo (and so the lanes) afterwards.
 */
export function useLanes({
  repo,
  git,
  askText,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath, status, branches } = repo
  // Ownership moves don't change git status, so they reload the lanes themselves.
  const [version, setVersion] = useState(0)
  // Cached per repo, so switching back to a tab shows its lanes at once.
  const lanes = useCached<LanesStatus | null>(repoPath ? cacheKey('lanes', repoPath) : null, null)
  // Reads are numbered so an answer only replaces a newer one's. A newer ask
  // doesn't throw away the answer still on its way: on a busy machine a read
  // takes seconds and the repo refreshes again meanwhile, so dropping
  // superseded answers left the lanes showing state from before a commit.
  const asked = useRef(0)
  const shown = useRef(0)
  useEffect(() => {
    if (!repoPath) return
    const seq = ++asked.current
    window.api.lanesStatus(repoPath).then((res) => {
      if (seq < shown.current) return
      shown.current = seq
      writeCached(cacheKey('lanes', repoPath), res.ok ? res.data : null)
    })
  }, [repoPath, status, version])
  const reload = (): void => setVersion((v) => v + 1)

  const localBranches = branches.filter((b) => !b.remote && b.name !== WORKSPACE_BRANCH).map((b) => b.name)

  /** Turns lanes on: picks the base new lanes start from, then names the first lane. */
  const start = async (): Promise<void> => {
    const current = status?.branch ?? ''
    const base = await askText({
      title: 'Turn on lanes',
      label: 'New lanes start from',
      options: localBranches,
      defaultValue: localBranches.includes('main') ? 'main' : localBranches.includes('master') ? 'master' : current,
      submitLabel: 'Next'
    })
    if (!base) return
    const lane = await askText({
      title: 'Turn on lanes',
      label: 'First lane (your uncommitted changes go here)',
      defaultValue: current !== base ? current : '',
      placeholder: 'e.g. fix-login',
      submitLabel: 'Turn on lanes'
    })
    if (!lane) return
    git.runGit(
      (path) => window.api.enterLanes(path, base, lane),
      () => setNotice(`Lanes are on. Your changes are in ${lane}; add a lane to split them up.`)
    )
  }

  const createLane = async (): Promise<void> => {
    const name = await askText({
      title: 'New lane',
      label: `Branch name (starts from ${lanes?.base ?? 'the base'})`,
      placeholder: 'e.g. fix-login',
      submitLabel: 'Create lane'
    })
    if (name) git.runGit((path) => window.api.createLane(path, name))
  }

  /** Applies a lane, or picks any local branch to apply as one. */
  const applyLane = async (name?: string): Promise<void> => {
    const known = new Set(lanes?.lanes.filter((l) => l.applied).map((l) => l.name))
    const pick =
      name ??
      (await askText({
        title: 'Apply a branch as a lane',
        label: 'Branch',
        options: localBranches.filter((b) => !known.has(b)),
        submitLabel: 'Apply'
      }))
    if (pick) git.runGit((path) => window.api.applyLane(path, pick))
  }

  const unapplyLane = (name: string, remove = false): void =>
    git.runGit(
      (path) => window.api.unapplyLane(path, name, remove),
      () => setNotice(remove ? `${name} is no longer a lane. Its branch is still there.` : `Unapplied ${name}. Its uncommitted changes are set aside until you apply it again.`)
    )

  const renameLane = async (name: string): Promise<void> => {
    const to = await askText({ title: `Rename ${name}`, label: 'New branch name', defaultValue: name, submitLabel: 'Rename' })
    if (to && to !== name) git.runGit((path) => window.api.renameLane(path, name, to))
  }

  const setDefaultLane = (name: string): void => git.runGit((path) => window.api.setDefaultLane(path, name), reload)

  const move = (lane: string, change: LaneMove): void => git.runGit((path) => window.api.moveToLane(path, lane, change), reload)

  /** Commits a lane; resolves to whether it worked, so its message box can clear. */
  const commitLane = async (lane: string, message: string): Promise<boolean> => {
    if (!repoPath) return false
    return git.withBusy(async () => {
      const res = await window.api.commitLane(repoPath, lane, message)
      if (!res.ok) showError(res.error)
      await repo.refresh(repoPath)
      return res.ok
    })
  }

  const pushLane = (lane: string): void =>
    git.runGit(
      (path) => window.api.pushLane(path, lane),
      (remote) => setNotice(`Pushed ${lane} to ${remote}.`)
    )

  const leave = async (): Promise<void> => {
    const names = lanes?.lanes.map((l) => l.name) ?? []
    const keep = await askText({
      title: 'Turn off lanes',
      label: 'Check out (its uncommitted changes come along; other lanes’ are set aside)',
      options: names,
      defaultValue: lanes?.lanes.find((l) => l.isDefault)?.name,
      submitLabel: 'Turn off lanes'
    })
    if (keep) git.runGit((path) => window.api.leaveLanes(path, keep), () => setNotice(`Lanes are off. You’re on ${keep}.`))
  }

  const adoptCommits = (lane: string): void =>
    git.runGit(
      (path) => window.api.adoptWorkspaceCommits(path, lane),
      (count) => setNotice(`Moved ${count} commit${count === 1 ? '' : 's'} to ${lane}.`)
    )

  const undo = (): void => git.runGit((path) => window.api.undoLaneChange(path), (label) => setNotice(`${label}: done.`))

  return {
    lanes,
    start,
    createLane,
    applyLane,
    unapplyLane,
    renameLane,
    setDefaultLane,
    move,
    commitLane,
    pushLane,
    leave,
    adoptCommits,
    undo,
    refreshWorkspace: () => git.runGit((path) => window.api.refreshWorkspace(path)),
    returnToWorkspace: () => git.runGit((path) => window.api.returnToWorkspace(path)),
    forget: () => git.runGit((path) => window.api.forgetLanes(path), () => setNotice('Lanes are off. Your lane branches are still there.'))
  }
}

export type Lanes = ReturnType<typeof useLanes>
