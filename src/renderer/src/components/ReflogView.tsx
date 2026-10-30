import { useEffect, useState, type JSX } from 'react'
import type { BranchInfo } from '../../../shared/types'
import type { ReflogEntry } from '../../../shared/reflog'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import Select from './Select'
import { timeAgo } from '../lib/time'

export interface ReflogActions {
  /** Selects the commit in the graph; false when no branch or tag reaches it any more. */
  showInGraph: (hash: string) => Promise<boolean>
  createBranchAt: (hash: string) => void
  resetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
}

interface Props {
  repoPath: string
  branches: BranchInfo[]
  /** Changes whenever the repo is re-read, so the list picks up new moves. */
  refreshKey: unknown
  actions: ReflogActions
  /** Called after Show in graph finds the commit, to get out of the way. */
  onShown: () => void
}

/** Where HEAD or a local branch has pointed, newest first, with ways back to any of it. */
export default function ReflogView({ repoPath, branches, refreshKey, actions, onShown }: Props): JSX.Element {
  const [ref, setRef] = useState('HEAD')
  const [loaded, setLoaded] = useState<{ ref: string; entries: ReflogEntry[] } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: ReflogEntry } | null>(null)
  /** The entry whose commit Show in graph couldn't find. */
  const [unreachable, setUnreachable] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    window.api.reflog(repoPath, ref).then((res) => {
      if (live) setLoaded({ ref, entries: res.ok ? res.data : [] })
    })
    return () => {
      live = false
    }
  }, [repoPath, ref, refreshKey])

  const current = branches.find((b) => b.current && !b.remote)?.name ?? null
  const local = branches.filter((b) => !b.remote)
  const options = [
    { value: 'HEAD', label: 'HEAD' },
    ...local.map((b) => ({ value: b.name, label: b.current ? `${b.name} (checked out)` : b.name }))
  ]
  const entries = loaded?.ref === ref ? loaded.entries : null

  const showInGraph = async (entry: ReflogEntry): Promise<void> => {
    setUnreachable(null)
    if (await actions.showInGraph(entry.hash)) onShown()
    else setUnreachable(entry.selector)
  }

  const menuSections = (entry: ReflogEntry): ContextMenuItem[][] => {
    const onto = current ? `Reset ${current} to here` : 'Reset HEAD to here'
    return [
      [
        { id: 'show', label: 'Show in graph', onSelect: () => void showInGraph(entry) },
        { id: 'branch', label: 'Create branch here…', onSelect: () => actions.createBranchAt(entry.hash) }
      ],
      [
        {
          id: 'reset',
          label: onto,
          submenu: [
            { id: 'soft', label: 'Soft: keep all changes staged', onSelect: () => actions.resetTo(entry.hash, 'soft') },
            { id: 'mixed', label: 'Mixed: keep working copy, unstage', onSelect: () => actions.resetTo(entry.hash, 'mixed') },
            { id: 'hard', label: 'Hard: discard all changes', danger: true, onSelect: () => actions.resetTo(entry.hash, 'hard') }
          ]
        }
      ],
      [{ id: 'copy', label: 'Copy commit SHA', onSelect: () => void navigator.clipboard.writeText(entry.hash) }]
    ]
  }

  return (
    <>
      <div className="activity-toolbar">
        <span className="modal-hint">
          Every place {ref === 'HEAD' ? 'HEAD' : ref} has pointed, from Git's reflog. Commits you reset away or amended are
          still here.
        </span>
        <Select value={ref} options={options} onChange={setRef} aria-label="Reflog of" className="reflog-ref" />
      </div>
      <ul className="activity-list reflog-list" aria-label="Reflog entries">
        {entries && entries.length === 0 && <li className="activity-empty">No reflog for {ref}.</li>}
        {entries?.map((entry) => (
          <li
            key={entry.selector}
            className="activity-entry reflog-entry"
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, entry })
            }}
          >
            <span className="reflog-selector">{entry.selector}</span>
            <span className="reflog-action-cell">
              <span className={`reflog-action ${entry.kind}`} title={entry.action}>
                {entry.action}
              </span>
            </span>
            <div className="activity-main">
              <div className="reflog-detail" title={entry.detail}>
                {entry.detail}
              </div>
              <div className="reflog-commit">
                <code>{entry.shortHash}</code> {entry.subject !== entry.detail && entry.subject}
              </div>
              {unreachable === entry.selector && (
                <div className="reflog-note">
                  No branch or tag reaches this commit any more, so the graph can't show it. Create a branch here to bring
                  it back.
                </div>
              )}
            </div>
            <span className="activity-meta" title={new Date(entry.time * 1000).toLocaleString()}>
              {timeAgo(new Date(entry.time * 1000).toISOString())}
            </span>
            <button
              className="icon-button reflog-more"
              aria-label={`Actions for ${entry.selector}`}
              title="Actions"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setMenu({ x: rect.left, y: rect.bottom, entry })
              }}
            >
              ⋯
            </button>
          </li>
        ))}
      </ul>
      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menuSections(menu.entry)} onClose={() => setMenu(null)} />}
    </>
  )
}
