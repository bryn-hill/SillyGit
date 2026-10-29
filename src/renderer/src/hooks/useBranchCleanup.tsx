import { useState } from 'react'
import { CLEANUP_SNOOZE_DAYS, type DeletedBranch } from '../../../shared/branchCleanup'
import type { GitRunner } from './useGitRunner'
import type { Repo } from './useRepo'
import { useRepoValue } from './useRepoValue'

/**
 * The "branches to tidy" banner and the Clean up branches dialog: snoozing
 * the banner, deleting the picked branches, and restoring the last batch.
 */
export function useBranchCleanup({
  repo,
  git,
  showError
}: {
  repo: Repo
  git: GitRunner
  showError: (message: string) => void
}) {
  const { repoPath, branchesListedAt, refresh } = repo
  // When the banner may show again, per repo.
  const [snoozedUntil, setSnoozedUntil] = useRepoValue(repoPath, window.api.getCleanupSnooze, null)
  const snoozed = snoozedUntil !== null && snoozedUntil > branchesListedAt
  const [dialogOpen, setDialogOpen] = useState(false)
  // The last batch of branches the dialog deleted, for Restore.
  const [restore, setRestore] = useState<{ repoPath: string; deleted: DeletedBranch[]; message: string } | null>(null)

  const snooze = (): void => {
    if (!repoPath) return
    const until = branchesListedAt + CLEANUP_SNOOZE_DAYS * 24 * 60 * 60 * 1000
    setSnoozedUntil(repoPath, until)
    window.api.setCleanupSnooze(repoPath, until).then((res) => !res.ok && showError(res.error))
  }

  const deleteBranches = (names: string[]): void => {
    setDialogOpen(false)
    git.runGit(
      (path) => window.api.deleteBranches(path, names),
      ({ deleted, failed }, path) => {
        if (deleted.length > 0) {
          setRestore({
            repoPath: path,
            deleted,
            message: `Deleted ${deleted.length} branch${deleted.length === 1 ? '' : 'es'}.`
          })
        }
        if (failed.length > 0) showError(`Couldn't delete ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`)
      }
    )
  }

  const restoreBranches = (): void => {
    const last = restore
    if (!last) return
    setRestore(null)
    git.withBusy(async () => {
      const res = await window.api.restoreBranches(last.repoPath, last.deleted)
      if (!res.ok) showError(res.error)
      await refresh(last.repoPath)
    })
  }

  return {
    snoozed,
    snooze,
    dialogOpen,
    open: () => setDialogOpen(true),
    close: () => setDialogOpen(false),
    deleteBranches,
    /** What Restore would bring back in the repo showing, or null. */
    restoreMessage: restore && restore.repoPath === repoPath ? restore.message : null,
    restoreBranches,
    dismissRestore: () => setRestore(null)
  }
}

export type BranchCleanup = ReturnType<typeof useBranchCleanup>
