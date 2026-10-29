import { useEffect, useState } from 'react'

/** Which of the app's dialogs and overlays are open. */
export function useDialogs(repoPath: string | null) {
  const [showSettings, setShowSettings] = useState(false)
  // Cmd+K opens the palette in the middle of the window; the toolbar's
  // Actions button opens the same list hanging under it.
  const [palette, setPalette] = useState<'modal' | 'dropdown' | null>(null)
  /** Tracked files, loaded when the Actions list opens, for its Blame and File history pickers. */
  const [trackedFiles, setTrackedFiles] = useState<string[]>([])
  const [showActivity, setShowActivity] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)

  // The Actions list's Blame and File history pickers list every tracked file.
  useEffect(() => {
    if (!palette || !repoPath) return
    let cancelled = false
    window.api.trackedFiles(repoPath).then((res) => {
      if (!cancelled) setTrackedFiles(res.ok ? res.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [palette, repoPath])

  return {
    showSettings,
    setShowSettings,
    palette,
    setPalette,
    trackedFiles,
    showActivity,
    setShowActivity,
    showUpdate,
    setShowUpdate
  }
}

export type Dialogs = ReturnType<typeof useDialogs>
