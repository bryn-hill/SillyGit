import { useEffect, useState } from 'react'
import type { CiRerun, CiStatusMap } from '../../../../shared/ciStatus'

const EMPTY: CiStatusMap = {}
// While a commit's checks are running, look again this often.
const PENDING_POLL_MS = 30_000

/**
 * CI status for the given commits, asked for whenever the list changes (so
 * after each fetch brings in new tips), every `pollMinutes` (auto-fetch's
 * interval; 0 = off), and every 30 seconds while any are running. The main
 * process caches answers, so asking again is cheap.
 */
export function useCiStatus(
  repoPath: string,
  shas: string[],
  pollMinutes: number
): {
  statuses: CiStatusMap
  rerun: (sha: string, targets: CiRerun[]) => Promise<{ ok: true } | { ok: false; error: string }>
} {
  const [result, setResult] = useState<{ repoPath: string; statuses: CiStatusMap }>({ repoPath, statuses: EMPTY })
  const statuses = result.repoPath === repoPath ? result.statuses : EMPTY

  const merge = (path: string, data: CiStatusMap): void =>
    setResult((prev) => ({ repoPath: path, statuses: prev.repoPath === path ? { ...prev.statuses, ...data } : data }))

  const key = shas.join(',')
  const anyPending = shas.some((s) => statuses[s]?.state === 'pending')
  const delayMs = anyPending ? PENDING_POLL_MS : pollMinutes > 0 ? pollMinutes * 60_000 : 0

  useEffect(() => {
    if (!key) return
    const list = key.split(',')
    let live = true
    const load = (): void => {
      void window.api.ciStatuses(repoPath, list).then((res) => {
        if (live && res.ok) {
          setResult((prev) => ({
            repoPath,
            statuses: prev.repoPath === repoPath ? { ...prev.statuses, ...res.data } : res.data
          }))
        }
      })
    }
    load()
    const timer = delayMs ? setInterval(load, delayMs) : null
    return () => {
      live = false
      if (timer) clearInterval(timer)
    }
  }, [repoPath, key, delayMs])

  const rerun = async (sha: string, targets: CiRerun[]): Promise<{ ok: true } | { ok: false; error: string }> => {
    const res = await window.api.ciRerun(repoPath, sha, targets)
    if (!res.ok) return res
    // The rerun dropped the cached answer, so this shows the checks running again.
    const again = await window.api.ciStatuses(repoPath, [sha])
    if (again.ok) merge(repoPath, again.data)
    return { ok: true }
  }

  return { statuses, rerun }
}
