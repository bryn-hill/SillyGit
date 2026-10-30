import { useState } from 'react'
import { defaultPushTarget, forcePushPrompt, rejectedPushPrompt, type PushOptions } from '../../../shared/push'
import type { ConflictableResult, FileStatus, FixupResult, PullMode, StashEntry, StashPushOptions } from '../../../shared/types'
import type { RebasePlan, RebaseStep } from '../../../shared/rebase'
import type { MergeResult, MergeStrategy } from '../../../shared/mergeOptions'
import type { MoveDirection, SquashMode } from '../../../shared/editCommit'
import type { DragSource, DropOption, DropTarget } from '../lib/refDrag'
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
  setNotice,
  prefillCommitMessage
}: {
  repo: Repo
  git: GitRunner
  view: MainView
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
  /** Starts the commit message box on `message` unless something is typed there. */
  prefillCommitMessage: (message: string) => void
}) {
  const { repoPath, status, undoLabel, redoLabel, refresh } = repo
  const { runGit, runGitThen, withBusy } = git
  const [pullMode, setPullMode] = useState<PullMode>(loadPullMode)
  // "Stash…" while it's open, with the files it opened with picked (every change when null).
  const [stashPicker, setStashPicker] = useState<{ paths: string[] | null } | null>(null)
  // The repo the Push to dialog was opened for.
  const [pushToRepo, setPushToRepo] = useState<string | null>(null)

  /**
   * Runs a git command that may stop on conflicts. When it does, the working
   * changes open so the conflicted files are in view.
   */
  const runConflictable = (call: (path: string) => Promise<IpcResult<ConflictableResult>>): void =>
    // Selected after the refresh, so the WIP row exists to select.
    runGitThen(call, (data) => {
      if (data.conflicts) view.showConflicts()
    })

  /** Runs a fixup or absorb, then says if it rewrote pushed commits or stopped on conflicts. */
  const runFixup = (call: (path: string) => Promise<IpcResult<FixupResult>>, done: string): void =>
    runGitThen(call, (data) => {
      if (data.conflicts) view.showConflicts()
      else setNotice(data.pushed ? `${done} That commit was already pushed, so pushing now needs a force push.` : done)
    })

  /** Folds everything staged into `hash`. */
  const fixupInto = (hash: string): void =>
    runFixup((path) => window.api.fixupInto(path, hash), `Folded the staged changes into ${hash.slice(0, 7)}.`)

  /** Folds staged hunks into the commits `assignments` picks for them (unit id to hash). */
  const absorb = (planHead: string, planDiff: string, assignments: Record<string, string>): void => {
    const count = new Set(Object.values(assignments)).size
    runFixup(
      (path) => window.api.absorb(path, planHead, planDiff, assignments),
      `Absorbed the staged changes into ${count} ${count === 1 ? 'commit' : 'commits'}.`
    )
  }

  /** Asks for a new message for `hash`, starting from its current one, and rewords it. */
  const rewordCommit = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const detail = await window.api.commitDetail(repoPath, hash)
    if (!detail.ok) {
      showError(detail.error)
      return
    }
    const current = [detail.data.subject, detail.data.body].filter((part) => part.trim()).join('\n\n')
    const message = await askText({
      title: `Reword ${hash.slice(0, 7)}`,
      label: 'Commit message',
      defaultValue: current,
      submitLabel: 'Reword',
      multiline: true,
      hint: 'The commits after it are replayed on top. Press ⌘/Ctrl+Enter to save.'
    })
    if (message === null || message.trim() === current.trim()) return
    runFixup((path) => window.api.rewordCommit(path, hash, message), `Reworded ${hash.slice(0, 7)}.`)
  }

  /** Swaps `hash` with the commit after it (up) or before it (down). */
  const moveCommit = (hash: string, direction: MoveDirection): void =>
    runFixup((path) => window.api.moveCommit(path, hash, direction), `Moved ${hash.slice(0, 7)} ${direction}.`)

  /** Folds `sources` into `target`, with their messages (squash) or without (fixup). */
  const squashCommits = (sources: string[], target: string, mode: SquashMode): void => {
    const what = sources.length === 1 ? sources[0].slice(0, 7) : `${sources.length} commits`
    runFixup(
      (path) => window.api.squashCommits(path, sources, target, mode),
      `${mode === 'squash' ? 'Squashed' : 'Fixed up'} ${what} into ${target.slice(0, 7)}.`
    )
  }

  /** Takes `path` (or one hunk of it) out of `hash` and puts the change back in the working tree. */
  const uncommitChange = (hash: string, path: string, oldPath: string | null, unitId: string | null): void =>
    runGitThen(
      (repo) => window.api.uncommitChange(repo, hash, path, oldPath, unitId),
      (data) => {
        view.closeFullScreen()
        if (data.conflicts) {
          view.showConflicts()
          return
        }
        const done = `Took ${unitId ? 'that change' : path} out of ${hash.slice(0, 7)}. It is in your working changes now.`
        setNotice(data.pushed ? `${done} That commit was already pushed, so pushing now needs a force push.` : done)
        view.goToWorkingChanges()
      }
    )

  const stage = (paths: string[]): void => runGit((path) => window.api.stage(path, paths))

  const unstage = (paths: string[]): void => runGit((path) => window.api.unstage(path, paths))

  const discard = (file: FileStatus): void => {
    if (!repoPath) return
    if (!window.confirm(`Discard changes to "${file.path}"? This cannot be undone.`)) return
    runGit((path) => window.api.discard(path, file.path, file.untracked))
  }

  /** Adds `pattern` to the root .gitignore, so the files it matches drop out of the working changes. */
  const ignore = (pattern: string): void =>
    runGit(
      (path) => window.api.ignore(path, pattern),
      (added) =>
        setNotice(
          added
            ? `Added ${pattern} to .gitignore. Commit .gitignore so everyone ignores it too.`
            : `.gitignore already has ${pattern}.`
        )
    )

  const undo = (): void => {
    if (undoLabel) runGit((path) => window.api.undo(path), (done) => setNotice(`${done}.`))
  }

  const redo = (): void => {
    if (redoLabel) runGit((path) => window.api.redo(path), (done) => setNotice(`${done}.`))
  }

  const fetch = (): void => {
    repo.fetchRemotes(false)
  }

  /**
   * Pushes the current branch. When git refuses because the remote branch
   * has commits this one doesn't (as it does after an amend, rebase, fixup or
   * absorb), asks whether to force push with a lease instead.
   */
  const push = (options: PushOptions = {}): void => {
    if (!repoPath) return
    withBusy(async () => {
      let forced = !!options.force
      let res = await window.api.push(repoPath, options)
      if (res.ok && res.data.rejected) {
        const { remote, branch } = res.data
        if (window.confirm(rejectedPushPrompt(remote, branch))) {
          forced = true
          res = await window.api.push(repoPath, { remote, branch, force: true })
        } else {
          setNotice(`Didn’t push: ${remote}/${branch} has commits your branch doesn’t. Pull to bring them in first.`)
        }
      }
      if (!res.ok) showError(res.error)
      else if (forced && !res.data.rejected) setNotice(`Force pushed to ${res.data.remote}/${res.data.branch}.`)
      await refresh(repoPath)
    })
  }

  /** Force pushes the current branch with a lease, after confirming. */
  const forcePush = (options: PushOptions = {}): void => {
    const target = status?.branch ? defaultPushTarget(status.branch, status.upstream, repo.remotes.map((r) => r.name)) : null
    const where = options.remote && options.branch ? `${options.remote}/${options.branch}` : target ? `${target.remote}/${target.branch}` : 'the remote'
    if (window.confirm(forcePushPrompt(where))) push({ ...options, force: true })
  }


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

  /**
   * Runs a merge. A squash merge leaves the branch's changes staged, so the
   * working changes open with a message ready to commit.
   */
  const runMerge = (branch: string, call: (path: string) => Promise<IpcResult<MergeResult>>): void =>
    runGitThen(call, (data) => {
      if (data.nothingToSquash) {
        setNotice(`${branch} has no changes to squash in.`)
        return
      }
      if (data.message) prefillCommitMessage(data.message)
      if (data.conflicts) view.showConflicts()
      else if (data.squashed) {
        view.goToWorkingChanges()
        setNotice(`Squashed ${branch}: its changes are staged. Commit them to finish the merge.`)
      }
    })

  const merge = (branch: string, strategy?: MergeStrategy): void =>
    runMerge(branch, (path) => window.api.mergeBranch(path, branch, strategy))

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
  const runDropAction = (source: DragSource, target: DropTarget, option: DropOption): void => {
    if (source.kind === 'commits' && (option.action === 'squash' || option.action === 'fixup')) {
      if (target.commit) squashCommits(source.hashes, target.commit, option.action)
      return
    }
    if (!target.branch) return
    const branch = target.branch
    if (source.kind === 'commits') {
      runConflictable((path) => window.api.cherryPickOnto(path, source.hashes, branch))
    } else if (option.action === 'merge') {
      runMerge(source.name, (path) => window.api.mergeInto(path, source.name, branch, option.strategy))
    } else if (option.action === 'rebase') {
      runConflictable((path) => window.api.rebaseBranchOnto(path, source.name, branch))
    } else if (option.action === 'fast-forward') {
      runGit((path) => window.api.fastForward(path, branch, source.name))
    }
  }

  const stash = (): void => runGit((path) => window.api.stash(path))

  const stashWithMessage = async (): Promise<void> => {
    if (!repoPath) return
    const message = await askText({ title: 'Stash changes', label: 'Stash message', submitLabel: 'Stash' })
    if (message !== null) runGit((path) => window.api.stash(path, message.trim() || undefined))
  }

  /** Stashes what "Stash…" picked. */
  const stashPush = (options: StashPushOptions): void => {
    setStashPicker(null)
    runGit((path) => window.api.stashPush(path, options))
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
    fixupInto,
    absorb,
    rewordCommit,
    moveCommit,
    squashCommits,
    uncommitChange,
    stage,
    unstage,
    discard,
    ignore,
    undo,
    redo,
    fetch,
    push,
    forcePush,
    pushTo: pushToRepo !== null && pushToRepo === repoPath,
    openPushTo: () => setPushToRepo(repoPath),
    closePushTo: () => setPushToRepo(null),
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
    stashPicker,
    openStashPicker: (paths: string[] | null = null): void => setStashPicker({ paths }),
    closeStashPicker: (): void => setStashPicker(null),
    stashPush,
    copyText,
    openUrl,
    revealRepo
  }
}

export type GitActions = ReturnType<typeof useGitActions>
