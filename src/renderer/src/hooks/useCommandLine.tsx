import { useEffect, useEffectEvent } from 'react'

/**
 * The `sillygit` command: opens the folders it asks for as tabs, once the
 * last session is back so they land on top of it, and installs the command.
 */
export function useCommandLine({
  sessionRestored,
  openFolder,
  showError,
  setNotice
}: {
  sessionRestored: boolean
  openFolder: (path: string) => Promise<void>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const openRequested = useEffectEvent(async () => {
    for (const request of await window.api.takeLaunchRequests()) {
      if (request.error) showError(request.error)
      else await openFolder(request.path)
    }
  })
  useEffect(() => {
    if (!sessionRestored) return
    void openRequested()
    return window.api.onLaunchRequested(() => void openRequested())
  }, [sessionRestored])

  const install = async (): Promise<void> => {
    const res = await window.api.installCommand()
    if (!res.ok) {
      showError(res.error)
      return
    }
    const { installedAt, note } = res.data
    setNotice(`Installed the sillygit command at ${installedAt}.${note ? ` ${note}` : ''} Run "sillygit ." in a repository to open it here.`)
  }

  return { install }
}
