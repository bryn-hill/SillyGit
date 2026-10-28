import { useState } from 'react'
import type { ConflictableResult, FileStatus, PullMode, StashEntry } from '../../../shared/types'
import type { RebasePlan, RebaseStep } from '../../../shared/rebase'
import type { DragSource, DropOption } from '../lib/refDrag'
import type { IpcResult } from '../lib/ipc'
import { loadPullMode, savePullMode } from '../lib/preferences'
import type { PromptRequest } from '../components/PromptDialog'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'
import type { Repo } from './useRepo'

/**
 * The everyday git commands: staging, undo and redo, syncing with the
 * remote, merging, rebasing, cherry-picking and reverting, resets, stashes,
 * patches, and what a drag and drop onto a branch does.
 */
export function useGitActions({
  repo,
  git,
  view,
  askText,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  view: MainView
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath, undoLabel, redoLabel, refresh } = repo
  const { runGit, runGitThen, withBusy } = git
  const [pullMode, setPullMode] = useState<PullMode>(loadPullMode)

  /**
   * Runs a git command that may stop on conflicts. When it does, the working
   * changes open so the conflicted files are in view.
   */
  const runConflictable = (call: (path: string) => Promise<IpcResult<ConflictableResult>>): void =>
    // Selected after the refresh, so the WIP row exists to select.
    runGitThen(call, (data) => {
      if (data.conflicts) view.showConflicts()
    })

  const stage = (paths: string[]): void => runGit((path) => window.api.stage(path, paths))

  const unstage = (paths: string[]): void => runGit((path) => window.api.unstage(path, paths))

  const discard = (file: FileStatus): void => {
    if (!repoPath) return
    if (!window.confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) return
    runGit((path) => window.api.discard(path, file.path, file.untracked))
  }

  const undo = (): void => {
    if (undoLabel) runGit((path) => window.api.undo(path), (done) => setNotice(`${done}.`))
  }

  const redo = (): void => {
    if (redoLabel) runGit((path) => window.api.redo(path), (done) => setNotice(`${done}.`))
  }

  const fetch = (): void => {
    repo.fetchRemotes(false)
  }

  const push = (): void => runGit((path) => window.api.push(path))

  /** Pulls the remembered way, or `mode`, which then becomes what Pull does. */
  const pull = (mode?: PullMode): void => {
    if (mode) {
      setPullMode(mode)
      savePullMode(mode)
    }
    runConflictable((path) => window.api.pull(path, mode ?? pullMode))
  }

  const checkout = (ref: string): void => runGit((path) => window.api.checkout(path, ref))

  const checkoutRemote = (name: string): void => runGit((path) => window.api.checkoutRemoteBranch(path, name))

  const merge = (branch: string): void => runConflictable((path) => window.api.mergeBranch(path, branch))

  const rebase = (branch: string): void => runConflictable((path) => window.api.rebaseOnto(path, branch))

  const cherryPick = (hash: string | string[]): void => runConflictable((path) => window.api.cherryPick(path, hash))

  const revert = (hash: string | string[]): void => runConflictable((path) => window.api.revertCommit(path, hash))

  const resetTo = (hash: string, mode: 'soft' | 'mixed' | 'hard'): void => {
    if (!repoPath) return
    if (
      mode === 'hard' &&
      !window.confirm(
        'Hard reset will discard all uncommitted changes and move the branch pointer. This cannot be undone easily. Continue?'
      )
    ) {
      return
    }
    runGit((path) => window.api.resetTo(path, hash, mode))
  }

  const applyPatch = (): void =>
    runGit(
      (path) => window.api.applyPatch(path),
      (applied) => {
        if (!applied) return
        setNotice(
          applied.conflicts
            ? `${applied.file} applied with conflicts. Resolve them in the changed files.`
            : `Applied ${applied.file}. Its changes are staged.`
        )
        view.goToWorkingChanges()
      }
    )

  const createPatch = (hash: string): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await window.api.createPatchFile(repoPath, hash)
      if (!res.ok) showError(res.error)
    })
  }

  /** Runs the planned rebase; resolves to false when it didn't start, so the editor stays open. */
  const startRebase = async (plan: RebasePlan, steps: RebaseStep[]): Promise<boolean> => {
    if (!repoPath) return false
    return withBusy(async () => {
      const res = await window.api.startInteractiveRebase(repoPath, plan.base.hash, plan.head, steps)
      const op = await window.api.operationState(repoPath)
      // A rebase that stopped part way (on a conflict, or a commit that came
      // out empty) goes on in the commit panel, like any other.
      const stopped = op.ok && op.data?.kind === 'rebase'
      if (!res.ok) showError(res.error)
      if (!res.ok && !stopped) return false
      view.closeRebase()
      await refresh(repoPath)
      if (stopped) {
        view.setSelection({ type: 'working' })
      } else {
        const kept = steps.filter((s) => s.action !== 'drop' && s.action !== 'squash' && s.action !== 'fixup').length
        setNotice(`Rebased ${plan.branch}: ${plan.commits.length} commit${plan.commits.length === 1 ? '' : 's'} became ${kept}.`)
      }
      return true
    })
  }

  /** What a branch or commit dropped on a branch does, picked from the drop menu. */
  const runDropAction = (source: DragSource, target: string, option: DropOption): void => {
    if (source.kind === 'commits') {
      runConflictable((path) => window.api.cherryPickOnto(path, source.hashes, target))
    } else if (option.action === 'merge') {
      runConflictable((path) => window.api.mergeInto(path, source.name, target))
    } else if (option.action === 'rebase') {
      runConflictable((path) => window.api.rebaseBranchOnto(path, source.name, target))
    } else if (option.action === 'fast-forward') {
      runGit((path) => window.api.fastForward(path, target, source.name))
    }
  }

  const stash = (): void => runGit((path) => window.api.stash(path))

  const stashWithMessage = async (): Promise<void> => {
    if (!repoPath) return
    const message = await askText({ title: 'Stash changes', label: 'Stash message', submitLabel: 'Stash' })
    if (message !== null) runGit((path) => window.api.stash(path, message.trim() || undefined))
  }

  /** Pops the newest stash. */
  const stashPop = (): void => runGit((path) => window.api.stashPop(path))

  const stashActions = {
    apply: (entry: StashEntry): void => runGit((path) => window.api.stashApply(path, entry.ref)),
    pop: (entry: StashEntry): void => runGit((path) => window.api.stashPop(path, entry.ref)),
    drop: (entry: StashEntry): void => {
      if (!repoPath) return
      if (!window.confirm(`Delete the stash "${entry.message}"? It can't be brought back from SillyGit.`)) return
      runGit((path) => window.api.stashDrop(path, entry.ref))
    }
  }

  const copyText = (text: string): void => {
    window.api.copyToClipboard(text)
  }

  const openUrl = (url: string): void => {
    window.api.openExternal(url).then((res) => !res.ok && showError(res.error))
  }

  const revealRepo = (path: string): void => {
    window.api.openPath(path).then((res) => {
      if (!res.ok) showError(res.error)
    })
  }

  return {
    runConflictable,
    stage,
    unstage,
    discard,
    undo,
    redo,
    fetch,
    push,
    pull,
    pullMode,
    checkout,
    checkoutRemote,
    merge,
    rebase,
    cherryPick,
    revert,
    resetTo,
    applyPatch,
    createPatch,
    startRebase,
    runDropAction,
    stash,
    stashWithMessage,
    stashPop,
    stashActions,
    copyText,
    openUrl,
    revealRepo
  }
}

export type GitActions = ReturnType<typeof useGitActions>
