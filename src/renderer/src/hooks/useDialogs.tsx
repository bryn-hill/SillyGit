import { useEffect, useState } from 'react'

/** The Activity dialog's tabs: commands SillyGit ran, or git's reflog. */
export type ActivityTab = 'commands' | 'reflog'

/** Which of the app's dialogs and overlays are open. */
export function useDialogs(repoPath: string | null) {
  const [showSettings, setShowSettings] = useState(false)
  // Cmd+K opens the palette in the middle of the window; the toolbar's
  // Actions button opens the same list hanging under it; Cmd+B opens the
  // palette on its Checkout list.
  const [palette, setPalette] = useState<'modal' | 'dropdown' | 'checkout' | null>(null)
  /** Tracked files, loaded when the Actions list opens, for its Blame and File history pickers. */
  const [trackedFiles, setTrackedFiles] = useState<string[]>([])
  const [activityTab, setActivityTab] = useState<ActivityTab | null>(null)
  const showActivity = activityTab !== null
  const setShowActivity = (open: boolean): void => setActivityTab(open ? 'commands' : null)
  const [showUpdate, setShowUpdate] = useState(false)
  const [showPublish, setShowPublish] = useState(false)

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
    activityTab,
    setActivityTab,
    showUpdate,
    setShowUpdate,
    showPublish,
    setShowPublish
  }
}

export type Dialogs = ReturnType<typeof useDialogs>
