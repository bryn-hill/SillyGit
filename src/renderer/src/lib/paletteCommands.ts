import type { Command } from '../components/CommandPalette'
import type { FileViewMode } from '../components/FileHistoryView'
import type { BranchInfo, OpenPullRequest, OperationState, PullMode, RepoStatus, StashEntry } from '../../../shared/types'
import type { RunMode } from '../../../shared/run'
import { repoDisplayName } from './repoName'
import { MOD } from './shortcuts'

/** What the Actions list and command palette need to know about the app, and the actions they run. */
export interface PaletteContext {
  repoPath: string | null
  status: RepoStatus | null
  /** The user's custom commands that can run from here, already bound to what they act on. */
  customCommands?: { id: string; label: string; run: () => void }[]
  branches: BranchInfo[]
  /** The repo's open pull requests, for "Check out pull request…". */
  pullRequests?: OpenPullRequest[]
  hasRemotes: boolean
  stashes: StashEntry[]
  operation: OperationState | null
  undoLabel: string | null
  redoLabel: string | null
  hasWorkingChanges: boolean
  /** The checked-out branch's stack, if it's in one: its bottom branch and whether anything in it is behind. */
  currentStack?: { id: string; needsRestack: boolean } | null
  /** A single commit is selected that Run can act on. */
  canRunCommit: boolean
  /** Every tracked file, for the Blame and File history pickers. */
  trackedFiles: string[]
  tabPinned: boolean
  tabCount: number
  recentRepos: string[]
  showClaude: boolean
  showTerminal: boolean
  showLaunchpad: boolean
  canSelfUpdate: boolean
  actions: {
    undo: () => void
    redo: () => void
    fetch: () => void
    pull: (mode: PullMode) => void
    push: () => void
    focusSearch: () => void
    goToWorkingChanges: () => void
    startAmend: () => void
    absorb: () => void
    run: (mode?: RunMode) => void
    editRunCommand: () => void
    openFileView: (path: string, mode: FileViewMode) => void
    applyPatch: () => void
    stash: () => void
    stashWithMessage: () => void
    applyStash: (stash: StashEntry) => void
    popStash: (stash: StashEntry) => void
    createBranch: () => void
    createStackedBranch: (parent: string) => void
    stackCurrentBranch: (branch: string) => void
    restack: (branch: string) => void
    pushStack: (branch: string) => void
    cleanUpBranches: () => void
    checkout: (branch: string) => void
    checkoutRemote: (branch: string) => void
    checkoutPullRequest: (number: number) => void
    merge: (branch: string) => void
    rebase: (branch: string) => void
    deleteBranch: (branch: string) => void
    renameBranch: (branch: string) => void
    continueOperation: () => void
    abortOperation: () => void
    closeTab: (path: string) => void
    togglePinTab: (path: string) => void
    toggleClaude: () => void
    revealRepo: (path: string) => void
    copyText: (text: string) => void
    showActivity: () => void
    showUpdate: () => void
    toggleLaunchpad: () => void
    cycleTab: (offset: number) => void
    clone: () => void
    toggleTerminal: () => void
    openRepo: () => void
    openRecentRepo: (path: string) => void
    openSettings: () => void
  }
}

/**
 * Everything the Actions list and command palette offer, alphabetically
 * like GitKraken's. Actions that need a branch or stash open a sub-list.
 */
export function paletteCommands(ctx: PaletteContext): Command[] {
  const { repoPath, status, branches, stashes, operation, actions: a } = ctx
  const commands: Command[] = []
  const add = (id: string, label: string, run: () => void, shortcut?: string): void => {
    commands.push({ id, label, run, shortcut })
  }
  const addList = (id: string, label: string, children: Command[]): void => {
    if (children.length > 0) commands.push({ id, label, children })
  }
  const localOthers = branches.filter((b) => !b.current && !b.remote)
  const current = status?.branch ?? 'HEAD'
  if (repoPath) {
    if (ctx.undoLabel) add('undo', ctx.undoLabel, a.undo, `${MOD}Z`)
    if (ctx.redoLabel) add('redo', ctx.redoLabel, a.redo, `${MOD}⇧Z`)
    if (ctx.hasRemotes) {
      add('fetch', 'Fetch all remotes', a.fetch)
      add('pull', 'Pull (fast-forward if possible)', () => a.pull('ff'))
      add('pull-ff-only', 'Pull (fast-forward only)', () => a.pull('ff-only'))
      add('pull-rebase', 'Pull (rebase)', () => a.pull('rebase'))
      add('push', 'Push', a.push)
    }
    add('search', 'Search commits', a.focusSearch, `${MOD}F`)
    add('commit', 'Go to uncommitted changes', a.goToWorkingChanges)
    add('amend', 'Amend last commit', a.startAmend)
    if (status?.staged.length) add('absorb', 'Absorb staged changes into earlier commits…', a.absorb)
    add('run', 'Run', () => a.run())
    if (ctx.canRunCommit) {
      add('run-isolated', 'Run selected commit in isolation', () => a.run('isolated'))
      add('run-checkout', 'Check out selected commit and run', () => a.run('checkout'))
    }
    add('run-command', 'Edit run command…', a.editRunCommand)
    addList(
      'blame',
      'Blame file',
      ctx.trackedFiles.map((path) => ({ id: path, label: path, run: () => a.openFileView(path, 'blame') }))
    )
    addList(
      'file-history',
      'File history',
      ctx.trackedFiles.map((path) => ({ id: path, label: path, run: () => a.openFileView(path, 'history') }))
    )
    add('apply-patch', 'Apply patch…', a.applyPatch)
    if (ctx.hasWorkingChanges && !operation) {
      add('stash', 'Stash changes', a.stash)
      add('stash-message', 'Stash changes with a message…', a.stashWithMessage)
    }
    addList(
      'stash-apply',
      'Apply stash',
      stashes.map((stash) => ({ id: stash.ref, label: `${stash.ref}: ${stash.message}`, run: () => a.applyStash(stash) }))
    )
    addList(
      'stash-pop',
      'Pop stash',
      stashes.map((stash) => ({ id: stash.ref, label: `${stash.ref}: ${stash.message}`, run: () => a.popStash(stash) }))
    )
    add('new-branch', 'Create branch…', a.createBranch)
    if (status?.branch) {
      const branch = status.branch
      add('new-stacked-branch', `New branch stacked on ${branch}…`, () => a.createStackedBranch(branch))
      if (ctx.currentStack) {
        const id = ctx.currentStack.id
        add('restack', ctx.currentStack.needsRestack ? `Restack the ${id} stack` : `Restack the ${id} stack (up to date)`, () => a.restack(branch))
        if (ctx.hasRemotes) add('push-stack', `Push the ${id} stack (force with lease)`, () => a.pushStack(branch))
      } else add('stack-on', `Stack ${branch} on another branch…`, () => a.stackCurrentBranch(branch))
    }
    add('cleanup-branches', 'Clean up branches…', a.cleanUpBranches)
    const checkouts: Command[] = []
    for (const b of branches) {
      if (b.current) continue
      if (b.remote) {
        if (branches.some((l) => !l.remote && l.upstream === b.name)) continue
        checkouts.push({ id: b.name, label: `Check out ${b.name}`, run: () => a.checkoutRemote(b.name) })
      } else {
        checkouts.push({ id: b.name, label: `Check out ${b.name}`, run: () => a.checkout(b.name) })
      }
    }
    addList('checkout', 'Checkout', checkouts)
    addList(
      'checkout-pr',
      'Check out pull request…',
      (ctx.pullRequests ?? []).map((pr) => ({
        id: String(pr.number),
        label: pr.title ? `#${pr.number} ${pr.title} (${pr.headRefName})` : `#${pr.number} ${pr.headRefName}`,
        run: () => a.checkoutPullRequest(pr.number)
      }))
    )
    addList(
      'merge',
      `Merge into ${current}`,
      localOthers.map((b) => ({ id: b.name, label: `Merge ${b.name} into ${current}`, run: () => a.merge(b.name) }))
    )
    addList(
      'rebase',
      `Rebase ${current} onto`,
      localOthers.map((b) => ({ id: b.name, label: `Rebase ${current} onto ${b.name}`, run: () => a.rebase(b.name) }))
    )
    addList(
      'delete-branch',
      'Delete branch',
      localOthers.map((b) => ({ id: b.name, label: `Delete ${b.name}`, run: () => a.deleteBranch(b.name) }))
    )
    if (status?.branch) add('rename-branch', `Rename ${status.branch}…`, () => a.renameBranch(status.branch!))
    if (operation) {
      add('continue', `Continue ${operation.kind}`, a.continueOperation)
      add('abort', `Abort ${operation.kind}`, a.abortOperation)
    }
    add('close-tab', 'Close tab', () => a.closeTab(repoPath))
    add('pin-tab', ctx.tabPinned ? 'Unpin tab' : 'Pin tab', () => a.togglePinTab(repoPath))
    add('claude', ctx.showClaude ? 'Hide Claude' : 'Show Claude', a.toggleClaude, 'Ctrl+Esc')
    add('reveal', 'Open repository folder', () => a.revealRepo(repoPath))
    add('copy-path', 'Copy repository path', () => a.copyText(repoPath))
  }
  add('activity', 'Activity log', a.showActivity)
  if (ctx.canSelfUpdate) add('update-sillygit', 'Update SillyGit…', a.showUpdate)
  add('launchpad', ctx.showLaunchpad ? 'Close Launchpad' : 'Open Launchpad', a.toggleLaunchpad)
  if (ctx.tabCount > 1) {
    add('next-tab', 'Next tab', () => a.cycleTab(1), 'Ctrl+Tab')
    add('previous-tab', 'Previous tab', () => a.cycleTab(-1), 'Ctrl+⇧Tab')
  }
  add('clone', 'Clone repository…', a.clone)
  add('terminal', ctx.showTerminal ? 'Hide terminal' : 'Show terminal', a.toggleTerminal, 'Ctrl+`')
  add('open-repo', 'Open repository…', a.openRepo, `${MOD}O`)
  addList(
    'recent',
    'Open recent repository',
    ctx.recentRepos
      .filter((path) => path !== repoPath)
      .map((path) => ({ id: path, label: repoDisplayName(path), run: () => a.openRecentRepo(path) }))
  )
  add('settings', 'Settings', a.openSettings, `${MOD},`)
  if (repoPath) for (const c of ctx.customCommands ?? []) commands.push({ ...c, id: `custom-${c.id}`, group: 'Custom' })
  return commands.sort((x, y) => x.label.localeCompare(y.label))
}
