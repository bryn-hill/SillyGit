import { useState } from 'react'
import type { IpcResult } from '../lib/ipc'

/**
 * Runs git commands on the open repo one at a time: `busy` is up while one
 * runs (the toolbar greys out), the error and notice banners are cleared when
 * it starts, failures are reported, and the repo is refreshed afterwards.
 */
export function useGitRunner({
  repoPath,
  refresh,
  showError,
  setNotice
}: {
  repoPath: string | null
  refresh: (path: string) => Promise<void>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const [busy, setBusy] = useState(false)

  const withBusy = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true)
    showError(null)
    setNotice(null)
    try {
      return await fn()
    } finally {
      setBusy(false)
    }
  }

  /** Runs `call` on the open repo, reports a failure (or hands the result to `onDone`), then refreshes. */
  const runGit = <T,>(call: (path: string) => Promise<IpcResult<T>>, onDone?: (data: T, path: string) => void): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await call(repoPath)
      if (!res.ok) showError(res.error)
      else onDone?.(res.data, repoPath)
      await refresh(repoPath)
    })
  }

  /** Like runGit, but `after` runs once the refresh is done (so new rows exist to select). */
  const runGitThen = <T,>(call: (path: string) => Promise<IpcResult<T>>, after: (data: T) => void): void => {
    if (!repoPath) return
    withBusy(async () => {
      const res = await call(repoPath)
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
      if (res.ok) after(res.data)
    })
  }

  return { busy, withBusy, runGit, runGitThen }
}

export type GitRunner = ReturnType<typeof useGitRunner>
