import { useEffect, useState } from 'react'
import { LFS_INSTALL_URL, NO_LFS, type LfsInfo } from '../../../shared/lfs'
import type { GitRunner } from './useGitRunner'

const DONE: Record<'fetch' | 'pull' | 'prune', string> = {
  fetch: 'Fetched the Git LFS files for this branch.',
  pull: 'Pulled the Git LFS files into your working tree.',
  prune: 'Pruned old Git LFS files from this machine.'
}

/**
 * Git LFS in the open repo: whether git-lfs is installed and which patterns
 * the repo stores in it (reloaded whenever `refreshKey` changes, each repo
 * refresh), tracking a new pattern, and fetching, pulling and pruning files.
 */
export function useLfs({
  repoPath,
  refreshKey,
  git,
  setNotice
}: {
  repoPath: string | null
  refreshKey: unknown
  git: GitRunner
  setNotice: (message: string | null) => void
}) {
  const [loaded, setLoaded] = useState<{ repoPath: string; info: LfsInfo } | null>(null)
  // The repo whose "git-lfs isn't installed" note was closed.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath) return
    let current = true
    window.api.lfsInfo(repoPath).then((res) => {
      if (current && res.ok) setLoaded({ repoPath, info: res.data })
    })
    return () => {
      current = false
    }
  }, [repoPath, refreshKey])

  // Another repo's patterns never show while this one's load.
  const info = loaded?.repoPath === repoPath ? loaded.info : NO_LFS
  const used = info.patterns.length > 0
  const missing = !!repoPath && !!loaded && loaded.repoPath === repoPath && used && !info.installed

  const track = (pattern: string): void =>
    git.runGit(
      (path) => window.api.lfsTrack(path, pattern),
      () => setNotice(`Tracking ${pattern} with Git LFS. Commit .gitattributes with the files so everyone stores them in LFS.`)
    )

  const run = (command: 'fetch' | 'pull' | 'prune'): void =>
    git.runGit((path) => window.api.lfsRun(path, command), () => setNotice(DONE[command]))

  return {
    info,
    /** The repo stores files in LFS. */
    used,
    /** The repo uses LFS, git-lfs isn't installed, and the note about it hasn't been closed. */
    showMissingNote: missing && dismissedFor !== repoPath,
    dismissMissingNote: () => setDismissedFor(repoPath),
    installLfs: () => void window.api.openExternal(LFS_INSTALL_URL),
    track,
    run
  }
}

export type Lfs = ReturnType<typeof useLfs>
