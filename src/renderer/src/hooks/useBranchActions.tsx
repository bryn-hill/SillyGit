import { toggleFavourite } from '../../../shared/branchStatus'
import { resolveBranchRemote } from '../../../shared/branchRemote'
import { withPullRequestText } from '../../../shared/quickActions'
import { stackOf, type StackInfo } from '../../../shared/stacks'
import type { OpenPullRequest, WorktreeInfo } from '../../../shared/types'
import type { PromptRequest } from '../components/PromptDialog'
import type { RefActions, RefTarget } from '../components/RefContextMenu'
import type { SidebarListActions } from '../components/SidebarLists'
import type { GitActions } from './useGitActions'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'
import type { Repo } from './useRepo'
import { useRepoValue } from './useRepoValue'
import { useStacks } from './useStacks'

const NO_FAVOURITES: string[] = []

/**
 * Branches, tags and worktrees: creating, renaming, deleting and pulling
 * them, starring favourites, and everything the branch and commit right-click
 * menu offers (`refActions`).
 */
export function useBranchActions({
  repo,
  git,
  actions,
  view,
  pullRequests,
  revalidatePullRequests,
  askText,
  showError,
  setNotice
}: {
  repo: Repo
  git: GitRunner
  actions: GitActions
  view: MainView
  pullRequests: OpenPullRequest[]
  revalidatePullRequests: () => void
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string) => void
  setNotice: (message: string | null) => void
}) {
  const { repoPath, status, branches, remotes, headHash, refresh } = repo
  const { runGit, runGitThen, withBusy } = git
  // Starred branches, per repo.
  const [favourites, setFavourites] = useRepoValue(repoPath, window.api.getFavouriteBranches, NO_FAVOURITES)
  const stacks = useStacks(repoPath, branches)

  const createBranch = (branch: string): void => runGit((path) => window.api.createBranch(path, branch))

  const promptCreateBranch = async (): Promise<void> => {
    const name = await askText({ title: 'Create branch', label: 'Branch name', submitLabel: 'Create branch' })
    if (name) createBranch(name)
  }

  const createBranchAt = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create branch here', label: 'Branch name', submitLabel: 'Create branch' })
    if (name) runGit((path) => window.api.createBranchAt(path, name, hash))
  }

  const createTag = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create tag here', label: 'Tag name', submitLabel: 'Create tag' })
    if (name) runGit((path) => window.api.createTag(path, name, hash))
  }

  const createAnnotatedTag = async (hash: string): Promise<void> => {
    if (!repoPath) return
    const name = await askText({ title: 'Create annotated tag here', label: 'Tag name', submitLabel: 'Next' })
    if (!name) return
    const message = await askText({
      title: `Annotate ${name}`,
      label: 'Tag message',
      defaultValue: name,
      submitLabel: 'Create tag'
    })
    if (message !== null) runGit((path) => window.api.createAnnotatedTag(path, name, message, hash))
  }

  const createWorktree = (ref: string, kind: 'local' | 'remote' | 'commit'): void =>
    runGit(
      (path) => window.api.addWorktree(path, ref, kind),
      (dir) => {
        if (dir) setNotice(`Created a worktree at ${dir}`)
      }
    )

  const deleteBranch = (target: RefTarget): void => {
    if (!repoPath) return
    if (target.remote) {
      if (!window.confirm(`Delete ${target.name} from the remote? Anyone else using it will lose it too.`)) return
      runGit((path) => window.api.deleteRemoteBranch(path, target.name))
      return
    }
    withBusy(async () => {
      let res = await window.api.deleteBranch(repoPath, target.name, false)
      if (!res.ok && /not fully merged/i.test(res.error)) {
        const force = window.confirm(
          `${target.name} has commits that aren't merged anywhere else. Delete it anyway? Those commits will be lost.`
        )
        if (force) res = await window.api.deleteBranch(repoPath, target.name, true)
        else res = { ok: true, data: undefined }
      }
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const renameBranch = async (name: string): Promise<void> => {
    if (!repoPath) return
    const next = await askText({ title: `Rename ${name}`, label: 'New branch name', defaultValue: name, submitLabel: 'Rename' })
    if (next && next !== name) runGit((path) => window.api.renameBranch(path, name, next))
  }

  /** Pulls the current branch as usual; any other local branch is fast-forwarded in place. */
  const pullBranch = (target: RefTarget): void => {
    if (target.current) {
      actions.pull()
      return
    }
    runGit(
      (path) => window.api.pullBranch(path, target.name),
      (res) => setNotice(res.updated ? `Pulled ${target.name}.` : `${target.name} is already up to date.`)
    )
  }

  const toggleFavouriteBranch = (name: string): void => {
    if (!repoPath) return
    const names = toggleFavourite(favourites, name)
    setFavourites(repoPath, names)
    window.api.setFavouriteBranches(repoPath, names).then((res) => !res.ok && showError(res.error))
  }

  const pushTag = (name: string): void => runGit((path) => window.api.pushTag(path, name), () => setNotice(`Pushed tag ${name}.`))

  const deleteTag = (name: string, remote: boolean): void => {
    const question = remote
      ? `Delete tag ${name} here and from the remote? Anyone who fetched it keeps their copy.`
      : `Delete tag ${name}? The commit it points at stays.`
    if (window.confirm(question)) runGit((path) => window.api.deleteTag(path, name, remote))
  }

  /** Removes a linked worktree, asking before throwing away changes left in it. */
  const removeWorktree = (worktree: WorktreeInfo): void => {
    if (!repoPath) return
    if (!window.confirm(`Remove the worktree at ${worktree.path}? Its folder is deleted; its branch stays.`)) return
    withBusy(async () => {
      let res = await window.api.removeWorktree(repoPath, worktree.path, false)
      if (!res.ok && /uncommitted changes/.test(res.error)) {
        if (window.confirm(`${worktree.path} has uncommitted changes. Remove it anyway? Those changes will be lost.`)) {
          res = await window.api.removeWorktree(repoPath, worktree.path, true)
        } else res = { ok: true, data: undefined }
      }
      if (!res.ok) showError(res.error)
      await refresh(repoPath)
    })
  }

  const localBranchNames = (except: string): string[] =>
    branches.filter((b) => !b.remote && b.name !== except).map((b) => b.name)

  const createStackedBranch = async (parent: string): Promise<void> => {
    const name = await askText({ title: `New branch stacked on ${parent}`, label: 'Branch name', submitLabel: 'Create branch' })
    if (name) runGit((path) => window.api.createStackedBranch(path, parent, name))
  }

  /** Asks which branch `branch` builds on, starting from its parent or the current branch. */
  const chooseStackParent = async (branch: string): Promise<void> => {
    const stack = stackOf(stacks, branch)
    const parent = await askText({
      title: stack ? `Change what ${branch} is stacked on` : `Stack ${branch} on another branch`,
      label: 'Parent branch',
      options: localBranchNames(branch),
      defaultValue: stack?.branches.find((b) => b.name === branch)?.parent ?? status?.branch ?? '',
      submitLabel: 'Stack'
    })
    if (parent) runGit((path) => window.api.setStackParent(path, branch, parent))
  }

  const leaveStack = (branch: string): void => runGit((path) => window.api.setStackParent(path, branch, null))

  /** Rebases the whole stack `branch` is in, then says what moved, or opens the conflicts it stopped on. */
  const restack = (branch: string): void =>
    runGitThen(
      (path) => window.api.restack(path, branch),
      (res) => {
        if (res.conflicts) {
          view.showConflicts()
          setNotice(
            `Restacking stopped on ${res.stoppedAt} with conflicts. Resolve them and continue the rebase, then restack again for the branches after it.` +
              (res.stashed ? ' Your uncommitted changes are in the stash.' : '')
          )
        } else if (res.restacked.length === 0) setNotice('The stack is already up to date.')
        else setNotice(`Restacked ${res.restacked.join(', ')}.`)
      }
    )

  const pushStack = (branch: string): void =>
    runGit(
      (path) => window.api.pushStack(path, branch),
      (res) => setNotice(`Pushed ${res.pushed.join(', ')} to ${res.remote}.`)
    )

  const stackActions: StackActions = {
    stackOf: (name) => stackOf(stacks, name),
    createStackedBranch,
    chooseStackParent,
    leaveStack,
    restack,
    pushStack
  }

  const listActions: Pick<SidebarListActions, 'pushTag' | 'deleteTag' | 'removeWorktree' | 'pruneWorktrees' | 'updateSubmodules'> = {
    pushTag,
    deleteTag,
    removeWorktree,
    pruneWorktrees: () => runGit((path) => window.api.pruneWorktrees(path)),
    updateSubmodules: (path) =>
      runGit(
        (repo) => window.api.updateSubmodules(repo, path),
        () => setNotice(path ? `Updated ${path}.` : 'Updated the submodules.')
      )
  }

  const refActions: RefActions = {
    checkout: actions.checkout,
    checkoutRemote: actions.checkoutRemote,
    merge: actions.merge,
    rebase: actions.rebase,
    createWorktree,
    createBranchAt,
    cherryPick: actions.cherryPick,
    interactiveRebase: view.planRebase,
    canInteractiveRebase: (hash) => !!status?.branch && hash !== headHash && repo.headAncestors.has(hash),
    resetTo: actions.resetTo,
    revertCommit: actions.revert,
    fixupInto: actions.fixupInto,
    canFixup: (hash) =>
      !!status?.branch && status.staged.length > 0 && (hash === headHash || repo.headAncestors.has(hash)),
    deleteBranch,
    renameBranch,
    pull: pullBranch,
    createTag,
    createAnnotatedTag,
    createPatch: actions.createPatch,
    copyText: actions.copyText,
    openUrl: actions.openUrl,
    startPullRequest: async (compareUrl, base, head, headBranch) => {
      if (!repoPath) return
      // Prefill from the commits by rule; fall back to the bare form if that fails.
      const res = await window.api.quickPullRequestText(repoPath, base, head, headBranch)
      const url = res.ok ? withPullRequestText(compareUrl, res.data) : compareUrl
      window.api.openExternal(url).then((r) => !r.ok && showError(r.error))
    },
    remoteInfo: (target) => resolveBranchRemote(target, branches, remotes, pullRequests),
    isFavourite: (name) => favourites.includes(name),
    toggleFavourite: toggleFavouriteBranch,
    revalidate: revalidatePullRequests,
    ...stackActions
  }

  return {
    favourites,
    toggleFavourite: toggleFavouriteBranch,
    createBranch,
    promptCreateBranch,
    deleteBranch,
    renameBranch,
    refActions,
    listActions,
    stacks,
    stackActions
  }
}

/** Stacked branches, from the branch menu, the side bar's Stacks list and the palette. */
export interface StackActions {
  stackOf: (name: string) => StackInfo | null
  createStackedBranch: (parent: string) => void
  /** Asks which branch to stack `branch` on. */
  chooseStackParent: (branch: string) => void
  leaveStack: (branch: string) => void
  restack: (branch: string) => void
  pushStack: (branch: string) => void
}

export type BranchActions = ReturnType<typeof useBranchActions>
