import { useState } from 'react'
import type { ConflictSnapshot } from '../../../shared/types'
import type { CommitBox } from './useCommitBox'
import type { GitActions } from './useGitActions'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'
import type { Repo } from './useRepo'

const fileCount = (n: number): string => (n === 1 ? '1 file' : `${n} files`)

/**
 * A merge, rebase, cherry-pick or revert that stopped on conflicts: taking a
 * side, marking files resolved (with Undo for bulk actions), the external
 * merge tool, and continuing, skipping or aborting.
 */
export function useConflicts({
  repo,
  git,
  actions,
  view,
  commitBox,
  externalToolName,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  actions: GitActions
  view: MainView
  commitBox: CommitBox
  externalToolName: string | null
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath, operation, refresh } = repo
  const { runGit, withBusy } = git
  const { runConflictable } = actions
  const { resolvingPath, setResolvingPath } = view
  // The last bulk conflict action (take a side, mark resolved), for Undo.
  const [undo, setUndo] = useState<{ repoPath: string; snapshot: ConflictSnapshot; message: string } | null>(null)
  // Undo only makes sense while the merge (or rebase…) that the files belong to is still going.
  if (!operation && undo) setUndo(null)

  const continueOperation = (): void => {
    const message = operation?.kind === 'rebase' ? undefined : commitBox.message.trim()
    runConflictable(async (path) => {
      const res = await window.api.continueOperation(path, message)
      if (res.ok && !res.data.conflicts) commitBox.setMessage('')
      return res
    })
  }

  const skip = (): void => runConflictable((path) => window.api.skipOperation(path))

  const abort = (): void => {
    if (!repoPath || !operation) return
    const ok = window.confirm(
      `Abort the ${operation.kind}? Your conflict resolutions will be lost and the branch goes back to how it was before.`
    )
    if (!ok) return
    runGit(
      (path) => window.api.abortOperation(path),
      () => {
        commitBox.setMessage('')
        setResolvingPath(null)
      }
    )
  }

  const takeSide = (paths: string[], side: 'current' | 'incoming'): void =>
    // All or nothing, and undoable: taking a side overwrites the working file.
    runGit(
      (path) => window.api.takeSideMany(path, paths, side),
      (snapshot, path) => {
        const label = side === 'current' ? operation?.currentLabel ?? 'current' : operation?.incomingLabel ?? 'incoming'
        setUndo({ repoPath: path, snapshot, message: `Took ${side} (${label}) for ${fileCount(paths.length)}.` })
        if (resolvingPath && paths.includes(resolvingPath)) setResolvingPath(null)
      }
    )

  const markResolved = (paths: string[]): void => {
    if (!repoPath) return
    withBusy(async () => {
      const marked = await window.api.pathsWithMarkers(repoPath, paths)
      if (marked.ok && marked.data.length > 0) {
        const list = marked.data.slice(0, 8).join('\n')
        const more = marked.data.length > 8 ? `\n…and ${marked.data.length - 8} more` : ''
        const ok = window.confirm(
          `${marked.data.length === 1 ? 'This file still has' : `${marked.data.length} files still have`} conflict markers:\n\n${list}${more}\n\nMark ${paths.length === 1 ? 'it' : 'them'} resolved anyway? The markers would be committed as they are.`
        )
        if (!ok) return
      }
      const res = await window.api.markResolved(repoPath, paths)
      if (!res.ok) showError(res.error)
      else if (paths.length > 1) {
        setUndo({ repoPath, snapshot: res.data, message: `Marked ${fileCount(paths.length)} resolved.` })
      }
      await refresh(repoPath)
    })
  }

  const undoLast = (): void => {
    const last = undo
    if (!last) return
    setUndo(null)
    withBusy(async () => {
      const res = await window.api.restoreConflicts(last.repoPath, last.snapshot)
      if (!res.ok) showError(res.error)
      await refresh(last.repoPath)
    })
  }

  const openExternal = async (path: string): Promise<void> => {
    if (!repoPath || !externalToolName) return
    const repoAtStart = repoPath
    setNotice(`Opened ${path} in ${externalToolName}. Save and close it there to finish.`)
    const res = await window.api.openInMergeTool(repoAtStart, path)
    if (!res.ok) {
      setNotice(null)
      showError(res.error)
    } else if (res.data.resolved) {
      setNotice(`Resolved ${path} in ${externalToolName}.`)
      setResolvingPath((p) => (p === path ? null : p))
    } else {
      setNotice(res.data.reason ?? `${path} is still conflicted.`)
    }
    await refresh(repoAtStart)
  }

  return {
    continueOperation,
    skip,
    abort,
    takeSide,
    markResolved,
    openExternal,
    /** What Undo would undo in the repo showing, or null. */
    undoMessage: undo && undo.repoPath === repoPath ? undo.message : null,
    undoLast,
    dismissUndo: () => setUndo(null)
  }
}

export type Conflicts = ReturnType<typeof useConflicts>
