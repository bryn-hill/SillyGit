import { checkoutNotice } from '../../../shared/prCheckout'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'
import type { Repo } from './useRepo'
import type { Tabs } from './useTabs'

/**
 * Checking out a pull request as a local branch, from Launchpad, the pull
 * request screen or the command palette. A pull request from another
 * workspace repo is checked out there and that repo's tab shown; either way
 * Launchpad closes so the graph shows the branch.
 */
export function usePullRequestCheckout({
  repo,
  git,
  view,
  tabs,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  view: MainView
  tabs: Tabs
  showError: (message: string) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath, refresh } = repo

  /** Resolves once the checkout has finished, or failed and said why. */
  const checkoutPullRequest = (path: string, number: number): Promise<void> =>
    git.withBusy(async () => {
      const res = await window.api.checkoutPullRequest(path, number)
      if (!res.ok) {
        showError(res.error)
        return
      }
      if (path === repoPath) {
        view.setShowLaunchpad(false)
        await refresh(path)
      } else {
        await tabs.openRecentRepo(path)
      }
      setNotice(checkoutNotice(number, res.data))
    })

  return checkoutPullRequest
}
