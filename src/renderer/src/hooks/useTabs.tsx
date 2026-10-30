import { useEffect, useEffectEvent, useState } from 'react'
import type { SavedLayout, SavedSession } from '../../../shared/types'
import type { PromptRequest } from '../components/PromptDialog'
import { cycleTab, moveTab, openTab, tabAfterClosing, togglePinnedTab } from '../lib/tabs'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'
import type { Repo } from './useRepo'

/**
 * Repo tabs and the recent repos list: opening, cloning, switching, closing,
 * pinning and reordering them, and reopening the last session on launch.
 * `showRepo` puts a repo up in the main area.
 */
export function useTabs({
  repo,
  git,
  view,
  showRepo,
  restoreLayout,
  askText,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  view: MainView
  showRepo: (path: string | null) => void
  restoreLayout: (layout: Partial<SavedLayout>) => void
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath } = repo
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  // Repos open as tabs, pinned ones first; repoPath is the active one.
  const [tabs, setTabs] = useState<string[]>([])
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([])
  // Tabs are saved only once the previous session has been restored, so the
  // defaults never overwrite it.
  const [sessionRestored, setSessionRestored] = useState(false)

  // Saved straight away (tabs change rarely) so a quick quit never loses one.
  useEffect(() => {
    if (sessionRestored) window.api.saveTabs({ openTabs: tabs, pinnedTabs, activeTab: repoPath })
  }, [sessionRestored, tabs, pinnedTabs, repoPath])

  // Reopen whatever was open when the app last quit.
  const restoreSession = useEffectEvent((session: SavedSession) => {
    restoreLayout(session.layout)
    setRecentRepos(session.recentRepos)
    setTabs(session.openTabs)
    setPinnedTabs(session.pinnedTabs)
    if (session.repoPath) showRepo(session.repoPath)
    if (session.missingRepo) {
      setNotice(`Couldn't reopen ${session.missingRepo}: the folder is gone or is no longer a git repository.`)
      window.api.forgetRecentRepo(session.missingRepo)
    }
    setSessionRestored(true)
  })
  useEffect(() => {
    window.api.getSession().then((session) => restoreSession(session))
  }, [])

  /**
   * Shows `path`: its tab if it has one, otherwise a new tab, or, with
   * `replace`, the current tab now showing `path` (unless that tab is pinned).
   */
  const switchToRepo = async (path: string, replace = false): Promise<void> => {
    // The replaced tab's snapshot goes here, not in the updater below: updaters must be pure.
    const replacing = replace && !!repoPath && !pinnedTabs.includes(repoPath) && !tabs.includes(path)
    if (replacing) repo.forget(repoPath)
    setTabs((current) => openTab(current, path, repoPath, replacing))
    showRepo(path)
    view.setShowLaunchpad(false)
    showError(null)
    setNotice(null)
    const res = await window.api.recordOpenedRepo(path)
    if (res.ok) setRecentRepos(res.data)
  }

  /** Picks a folder and opens it, offering to make it a git repo first if it isn't one. */
  const openRepo = async (): Promise<void> => {
    const picked = await window.api.openRepoDialog()
    if (!picked) return
    const isRepo = await window.api.isGitRepo(picked)
    if (!isRepo) {
      const shouldInit = window.confirm(`"${picked}" is not a git repository yet. Initialize one here?`)
      if (!shouldInit) return
      const initRes = await window.api.initRepo(picked)
      if (!initRes.ok) {
        showError(initRes.error)
        return
      }
    }
    await switchToRepo(picked)
  }

  /** Opens a recent repo, in place of the current tab when `replace` is set. */
  const openRecentRepo = async (path: string, replace = false): Promise<void> => {
    if (path === repoPath) {
      view.setShowLaunchpad(false)
      return
    }
    if (!(await window.api.isGitRepo(path))) {
      showError(`${path} is gone or is no longer a git repository, so it was removed from recent repositories.`)
      const res = await window.api.forgetRecentRepo(path)
      if (res.ok) setRecentRepos(res.data)
      if (tabs.includes(path)) closeTabs([path])
      return
    }
    await switchToRepo(path, replace)
  }

  const clone = async (): Promise<void> => {
    const url = await askText({
      title: 'Clone a repository',
      label: 'Repository URL',
      placeholder: 'https://github.com/owner/repo.git',
      submitLabel: 'Choose folder…'
    })
    if (!url?.trim()) return
    await git.withBusy(async () => {
      setNotice('Cloning…')
      const res = await window.api.clone(url.trim())
      setNotice(null)
      if (!res.ok) showError(res.error)
      else if (res.data) await switchToRepo(res.data)
    })
  }

  const selectTab = (path: string): void => {
    if (path === repoPath) view.setShowLaunchpad(false)
    else openRecentRepo(path)
  }

  const closeTabs = (paths: string[]): void => {
    if (paths.length === 0) return
    if (!view.closeEditorsFor(paths)) return
    for (const path of paths) repo.forget(path)
    setTabs(tabs.filter((p) => !paths.includes(p)))
    setPinnedTabs((current) => current.filter((p) => !paths.includes(p)))
    if (repoPath && paths.includes(repoPath)) {
      const next = tabAfterClosing(tabs, repoPath, paths)
      if (next) openRecentRepo(next)
      else showRepo(null)
    }
  }

  const togglePin = (path: string): void => {
    const next = togglePinnedTab(tabs, pinnedTabs, path)
    setPinnedTabs(next.pinned)
    setTabs(next.tabs)
  }

  const move = (path: string, before: string | null): void =>
    setTabs((current) => moveTab(current, pinnedTabs, path, before))

  /** Ctrl+Tab and friends: the tab `offset` places along, wrapping around. */
  const cycle = (offset: number): void => {
    const next = cycleTab(tabs, repoPath, offset)
    if (next) selectTab(next)
  }

  return {
    sessionRestored,
    tabs,
    pinnedTabs,
    recentRepos,
    openRepo,
    openRecentRepo,
    clone,
    selectTab,
    closeTabs,
    togglePin,
    move,
    cycle
  }
}

export type Tabs = ReturnType<typeof useTabs>
