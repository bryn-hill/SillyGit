import { useEffect, useState } from 'react'
import type { AppUpdateStatus } from '../../../shared/appUpdate'

/** An installed build against the newest GitHub release, for the Update button. Null until it's known. */
export function useAppUpdate(): AppUpdateStatus | null {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  useEffect(() => {
    let live = true
    window.api.appUpdateStatus().then((s) => live && setStatus(s))
    const stop = window.api.onAppUpdateChanged(setStatus)
    return () => {
      live = false
      stop()
    }
  }, [])
  return status
}
