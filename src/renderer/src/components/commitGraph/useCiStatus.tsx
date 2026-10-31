import { useEffect } from 'react'
import type { CiRerun, CiStatusMap } from '../../../../shared/ciStatus'
import { useCached } from '../../hooks/useCached'
import { cacheKey, updateCached } from '../../lib/swrCache'

const EMPTY: CiStatusMap = {}
// While a commit's checks are running, look again this often.
const PENDING_POLL_MS = 30_000

/**
 * CI status for the given commits, asked for whenever the list changes (so
 * after each fetch brings in new tips), every `pollMinutes` (auto-fetch's
 * interval; 0 = off), and every 30 seconds while any are running. The main
 * process caches answers, so asking again is cheap. Stale-while-revalidate:
 * each repo's statuses are cached here too, so switching back to a tab shows
 * its CI results (failed runs included) at once while they're asked for again.
 */
export function useCiStatus(
  repoPath: string,
  shas: string[],
  pollMinutes: number
): {
  statuses: CiStatusMap
  rerun: (sha: string, targets: CiRerun[]) => Promise<{ ok: true } | { ok: false; error: string }>
} {
  const statuses = useCached(ciKey(repoPath), EMPTY)

  const key = shas.join(',')
  const anyPending = shas.some((s) => statuses[s]?.state === 'pending')
  const delayMs = anyPending ? PENDING_POLL_MS : pollMinutes > 0 ? pollMinutes * 60_000 : 0

  useEffect(() => {
    if (!key) return
    const list = key.split(',')
    let live = true
    const load = (): void => {
      void window.api.ciStatuses(repoPath, list).then((res) => {
        if (live && res.ok) merge(repoPath, res.data)
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

const ciKey = (repoPath: string): string => cacheKey('ci-status', repoPath)

/** Adds `data` to the repo's cached statuses; the newest answer for a commit wins. */
function merge(repoPath: string, data: CiStatusMap): void {
  updateCached<CiStatusMap>(ciKey(repoPath), (prev) => ({ ...prev, ...data }))
}
