import { useEffect, type JSX } from 'react'
import { canOpenPullRequests } from '../../../shared/createPullRequest'
import type { BranchRemoteInfo } from '../../../shared/types'
import type { StackActions } from '../hooks/useBranchActions'
import { useCustomCommandMenu } from '../lib/customCommandMenu'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

const MAX_REF_LENGTH = 36

/**
 * Shortens a long branch name in the middle, keeping its start (the remote and
 * folder) and its end (usually the most telling part):
 * "SillyGit/renovate/major-xterm-monorepo" -> "SillyGit/renovate/…xterm-monorepo".
 */
export function shortRef(name: string, max = MAX_REF_LENGTH): string {
  if (name.length <= max) return name
  const tail = Math.ceil((max - 1) / 2)
  const head = max - 1 - tail
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`
}

/** A branch the menu was opened on. */
export interface RefTarget {
  name: string
  remote: boolean
  current: boolean
}

/** Everything the branch/commit right-click menu can do; App supplies these. */
export interface RefActions extends StackActions {
  checkout: (refOrHash: string) => void
  checkoutRemote: (name: string) => void
  merge: (branch: string) => void
  rebase: (branch: string) => void
  createWorktree: (ref: string, kind: 'local' | 'remote' | 'commit') => void
  createBranchAt: (hash: string) => void
  cherryPick: (hash: string) => void
  /** Opens the interactive rebase of the current branch's commits after `hash`. */
  interactiveRebase: (hash: string) => void
  /** Whether `hash` is below HEAD on the current branch, so an interactive rebase can start there. */
  canInteractiveRebase: (hash: string) => boolean
  /** Folds the staged changes into `hash`, an earlier commit of the current branch. */
  fixupInto: (hash: string) => void
  /** Whether something is staged and `hash` is on the current branch, so it can take a fixup. */
  canFixup: (hash: string) => boolean
  resetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  revertCommit: (hash: string) => void
  deleteBranch: (target: RefTarget) => void
  renameBranch: (name: string) => void
  /** Pulls the current branch, or fast-forwards another local branch from its upstream without checking it out. */
  pull: (target: RefTarget) => void
  createTag: (hash: string) => void
  createAnnotatedTag: (hash: string) => void
  createPatch: (hash: string) => void
  copyText: (text: string) => void
  openUrl: (url: string) => void
  /** Opens the Create pull request dialog for `target`, into the checked-out branch unless it's the target. */
  startPullRequest: (target: RefTarget, remote: string) => void
  /** Where the branch lives on its remote. Synchronous: the app keeps remotes and open PRs cached. */
  remoteInfo: (target: RefTarget) => BranchRemoteInfo | null
  /** Refreshes that cache in the background; the menu re-renders when it lands. */
  revalidate: () => void
  /** Whether a branch is starred, which pins it to the top of the branch list. */
  isFavourite: (name: string) => boolean
  toggleFavourite: (name: string) => void
}

interface Props {
  x: number
  y: number
  /** The commit the menu acts on: the branch tip, or the right-clicked commit. */
  hash: string
  /** The branch the menu was opened on, if any. */
  target: RefTarget | null
  currentBranch: string | null
  headHash: string | null
  actions: RefActions
  onClose: () => void
}

/**
 * The GitKraken-style right-click menu for a branch or commit, shared by the
 * sidebar and the commit graph.
 */
export default function RefContextMenu({
  x,
  y,
  hash,
  target,
  currentBranch,
  headHash,
  actions,
  onClose
}: Props): JSX.Element {
  const info = target ? actions.remoteInfo(target) : null
  const customMenu = useCustomCommandMenu()
  const { revalidate } = actions
  useEffect(() => {
    if (target) revalidate()
  }, [target, revalidate])

  const into = currentBranch ?? 'HEAD'
  const name = target ? shortRef(target.name) : ''
  const shortInto = shortRef(into)
  const isHeadCommit = hash === headHash
  const sections: ContextMenuItem[][] = []

  // Local branches that track a remote can be pulled, checked out or not.
  if (target && !target.remote && info?.remoteBranch) {
    sections.push([
      {
        id: 'pull',
        label: target.current ? 'Pull' : `Pull ${name} (fast-forward)`,
        onSelect: () => actions.pull(target)
      }
    ])
  }

  if (target && !target.current) {
    sections.push([
      { id: 'merge', label: `Merge ${name} into ${shortInto}`, onSelect: () => actions.merge(target.name) },
      { id: 'rebase', label: `Rebase ${shortInto} onto ${name}`, onSelect: () => actions.rebase(target.name) }
    ])
  }

  if (target && !target.current) {
    sections.push([
      {
        id: 'checkout',
        label: `Checkout ${name}`,
        onSelect: () => (target.remote ? actions.checkoutRemote(target.name) : actions.checkout(target.name))
      }
    ])
  } else if (!target && !isHeadCommit) {
    sections.push([{ id: 'checkout', label: 'Checkout this commit', onSelect: () => actions.checkout(hash) }])
  }

  if (target && !target.current) {
    sections.push([
      {
        id: 'worktree',
        label: `Create worktree from ${name}…`,
        onSelect: () => actions.createWorktree(target.name, target.remote ? 'remote' : 'local')
      }
    ])
  } else if (!target) {
    sections.push([
      { id: 'worktree', label: 'Create worktree from this commit…', onSelect: () => actions.createWorktree(hash, 'commit') }
    ])
  }

  const commitItems: ContextMenuItem[] = [
    { id: 'branch', label: 'Create branch here…', onSelect: () => actions.createBranchAt(hash) }
  ]
  if (!isHeadCommit) {
    commitItems.push(
      { id: 'cherry-pick', label: 'Cherry-pick commit', onSelect: () => actions.cherryPick(hash) },
      {
        id: 'reset',
        label: `Reset ${shortInto} to this commit`,
        submenu: [
          { id: 'reset-soft', label: 'Soft — keep all changes', onSelect: () => actions.resetTo(hash, 'soft') },
          {
            id: 'reset-mixed',
            label: 'Mixed — keep working copy, reset index',
            onSelect: () => actions.resetTo(hash, 'mixed')
          },
          {
            id: 'reset-hard',
            label: 'Hard — discard all changes',
            danger: true,
            onSelect: () => actions.resetTo(hash, 'hard')
          }
        ]
      }
    )
  }
  commitItems.push({ id: 'revert', label: 'Revert commit', onSelect: () => actions.revertCommit(hash) })
  sections.push(commitItems)

  const rewriteItems: ContextMenuItem[] = []
  if (currentBranch && actions.canFixup(hash)) {
    rewriteItems.push({
      id: 'fixup',
      label: 'Fix up this commit with staged changes',
      title: 'Fold what is staged into this commit and replay the commits after it',
      onSelect: () => actions.fixupInto(hash)
    })
  }
  if (currentBranch && actions.canInteractiveRebase(hash)) {
    rewriteItems.push({
      id: 'interactive-rebase',
      label: `Interactive rebase ${shortInto} to here…`,
      onSelect: () => actions.interactiveRebase(hash)
    })
  }
  if (rewriteItems.length > 0) sections.push(rewriteItems)

  if (target) {
    const prItems: ContextMenuItem[] = []
    if (info?.pullRequest) {
      const pr = info.pullRequest
      prItems.push(
        { id: 'pr-view', label: `View pull request #${pr.number} on GitHub`, onSelect: () => actions.openUrl(pr.url) },
        { id: 'pr-copy', label: `Copy link for pull request #${pr.number}`, onSelect: () => actions.copyText(pr.url) }
      )
    } else if (info?.remote && canOpenPullRequests(info.webUrl)) {
      const remote = info.remote
      prItems.push({
        id: 'pr-start',
        label:
          !target.current && currentBranch
            ? `Start a pull request from ${name} into ${shortRef(currentBranch)}…`
            : `Start a pull request from ${name}…`,
        onSelect: () => actions.startPullRequest(target, remote)
      })
    }
    if (prItems.length > 0) sections.push(prItems)
  }

  if (target && !target.remote) {
    const stack = actions.stackOf(target.name)
    const stackItems: ContextMenuItem[] = [
      {
        id: 'stack-new',
        label: `New branch stacked on ${name}…`,
        onSelect: () => actions.createStackedBranch(target.name)
      }
    ]
    if (stack) {
      const size = stack.branches.length
      stackItems.push(
        {
          id: 'restack',
          label: `Restack ${size === 1 ? shortRef(stack.id) : `the ${shortRef(stack.id)} stack (${size} branches)`}`,
          title: 'Rebase each branch in the stack onto its parent, bottom up',
          onSelect: () => actions.restack(target.name)
        },
        { id: 'stack-push', label: 'Push the stack (force with lease)', onSelect: () => actions.pushStack(target.name) },
        { id: 'stack-parent', label: `Change what ${name} is stacked on…`, onSelect: () => actions.chooseStackParent(target.name) },
        { id: 'stack-leave', label: `Take ${name} out of the stack`, onSelect: () => actions.leaveStack(target.name) }
      )
    } else {
      stackItems.push({ id: 'stack-on', label: `Stack ${name} on…`, onSelect: () => actions.chooseStackParent(target.name) })
    }
    sections.push(stackItems)
  }

  if (target && !target.current) {
    const branchItems: ContextMenuItem[] = []
    if (!target.remote) {
      branchItems.push({ id: 'rename', label: `Rename ${name}…`, onSelect: () => actions.renameBranch(target.name) })
    }
    branchItems.push({
      id: 'delete',
      label: target.remote ? `Delete ${name} from remote` : `Delete ${name}`,
      danger: true,
      onSelect: () => actions.deleteBranch(target)
    })
    sections.push(branchItems)
  } else if (target && !target.remote) {
    sections.push([{ id: 'rename', label: `Rename ${name}…`, onSelect: () => actions.renameBranch(target.name) }])
  }

  if (target) {
    const starred = actions.isFavourite(target.name)
    sections.push([
      {
        id: 'favourite',
        label: starred ? `Remove ${name} from favourites` : `Add ${name} to favourites`,
        onSelect: () => actions.toggleFavourite(target.name)
      }
    ])
  }

  const copyItems: ContextMenuItem[] = []
  if (target) {
    copyItems.push({ id: 'copy-name', label: 'Copy branch name', onSelect: () => actions.copyText(target.name) })
  }
  copyItems.push({ id: 'copy-sha', label: 'Copy commit SHA', onSelect: () => actions.copyText(hash) })
  if (info?.webUrl && info.remoteBranch) {
    const url = `${info.webUrl}/tree/${encodeURI(info.remoteBranch)}`
    copyItems.push({
      id: 'copy-branch-link',
      label: `Copy link to branch: ${shortRef(`${info.remote}/${info.remoteBranch}`)}`,
      onSelect: () => actions.copyText(url)
    })
  }
  if (info?.webUrl) {
    const url = `${info.webUrl}/commit/${hash}`
    copyItems.push({
      id: 'copy-commit-link',
      label: `Copy link to this commit on remote: ${info.remote}`,
      onSelect: () => actions.copyText(url)
    })
  }
  copyItems.push({ id: 'patch', label: 'Create patch from commit…', onSelect: () => actions.createPatch(hash) })
  sections.push(copyItems)

  sections.push([
    { id: 'tag', label: 'Create tag here…', onSelect: () => actions.createTag(hash) },
    { id: 'annotated-tag', label: 'Create annotated tag here…', onSelect: () => actions.createAnnotatedTag(hash) }
  ])

  const custom = customMenu(target ? ['branch', 'commit'] : 'commit', { sha: hash, branch: target?.name })
  if (custom.length > 0) sections.push(custom)

  // Shortened labels show the full branch names on hover.
  const fullNames = [target?.name, into, info?.remoteBranch && `${info.remote}/${info.remoteBranch}`]
  const shortened = fullNames.filter((n): n is string => !!n && shortRef(n) !== n)
  if (shortened.length > 0) {
    for (const item of sections.flat()) {
      let full = item.label
      for (const n of shortened) full = full.split(shortRef(n)).join(n)
      if (full !== item.label) item.title = full
    }
  }

  return <ContextMenu x={x} y={y} sections={sections} onClose={onClose} />
}
