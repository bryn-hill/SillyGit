import { useEffect, useState } from 'react'
import type { SelfUpdateStatus, SelfUpdateStep } from '../../../shared/selfUpdate'

export interface SelfUpdateState {
  status: SelfUpdateStatus
  step: SelfUpdateStep | null
}

/** SillyGit's own checkout against origin/main, for the Update button. Null until it's known. */
export function useSelfUpdate(): SelfUpdateState | null {
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateState | null>(null)
  useEffect(() => {
    let live = true
    window.api.selfUpdateStatus().then((state) => live && setSelfUpdate(state))
    const stop = window.api.onSelfUpdateChanged((status, step) => setSelfUpdate({ status, step }))
    return () => {
      live = false
      stop()
    }
  }, [])
  return selfUpdate
}
