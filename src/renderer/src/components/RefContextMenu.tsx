import { useEffect, useState, type JSX } from 'react'
import type { BranchRemoteInfo } from '../../../shared/types'
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
export interface RefActions {
  checkout: (refOrHash: string) => void
  checkoutRemote: (name: string) => void
  merge: (branch: string) => void
  rebase: (branch: string) => void
  createWorktree: (ref: string, kind: 'local' | 'remote' | 'commit') => void
  createBranchAt: (hash: string) => void
  cherryPick: (hash: string) => void
  resetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  revertCommit: (hash: string) => void
  deleteBranch: (target: RefTarget) => void
  renameBranch: (name: string) => void
  createTag: (hash: string) => void
  createAnnotatedTag: (hash: string) => void
  createPatch: (hash: string) => void
  copyText: (text: string) => void
  openUrl: (url: string) => void
  remoteInfo: (target: RefTarget) => Promise<BranchRemoteInfo | null>
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
  const [remoteInfo, setRemoteInfo] = useState<BranchRemoteInfo | null | 'loading'>(target ? 'loading' : null)

  useEffect(() => {
    if (!target) return
    let cancelled = false
    actions.remoteInfo(target).then((info) => {
      if (!cancelled) setRemoteInfo(info)
    })
    return () => {
      cancelled = true
    }
    // Look the branch up once per menu.
  }, [target?.name, target?.remote])

  const into = currentBranch ?? 'HEAD'
  const name = target ? shortRef(target.name) : ''
  const shortInto = shortRef(into)
  const isHeadCommit = hash === headHash
  const sections: ContextMenuItem[][] = []

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

  const info = remoteInfo === 'loading' ? null : remoteInfo
  if (target) {
    const prItems: ContextMenuItem[] = []
    if (remoteInfo === 'loading') {
      prItems.push({ id: 'pr-loading', label: 'Looking for a pull request…', disabled: true })
    } else if (info?.pullRequest) {
      const pr = info.pullRequest
      prItems.push(
        { id: 'pr-view', label: `View pull request #${pr.number} on GitHub`, onSelect: () => actions.openUrl(pr.url) },
        { id: 'pr-copy', label: `Copy link for pull request #${pr.number}`, onSelect: () => actions.copyText(pr.url) }
      )
    } else if (info?.webUrl && info.remoteBranch && !target.current && currentBranch) {
      const compare = `${info.webUrl}/compare/${encodeURI(currentBranch)}...${encodeURI(info.remoteBranch)}?expand=1`
      prItems.push({
        id: 'pr-start',
        label: `Start a pull request from ${name} into ${shortRef(currentBranch)}`,
        onSelect: () => actions.openUrl(compare)
      })
    }
    if (prItems.length > 0) sections.push(prItems)
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
