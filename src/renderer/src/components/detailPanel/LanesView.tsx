import { useState, type JSX } from 'react'
import type { LaneFile, LaneInfo, LanesStatus } from '../../../../shared/lanes'
import type { FileStatus } from '../../../../shared/types'
import type { Lanes } from '../../hooks/useLanes'
import { laneColor } from '../../lib/lanes'
import { isPrimary, MOD } from '../../lib/shortcuts'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'
import type { ActiveFile } from './types'

const DRAG_TYPE = 'application/x-sillygit-lane-file'

interface Props {
  status: LanesStatus
  actions: Lanes
  activeFile: ActiveFile | null
  onOpenFile: (file: FileStatus, staged: boolean) => void
}

type Menu = { x: number; y: number; sections: ContextMenuItem[][] }

/** As the working changes lists show it, so the file opens like any other unstaged change. */
function asFileStatus(file: LaneFile): FileStatus {
  return file.untracked
    ? { path: file.path, index: '?', worktree: '?', untracked: true }
    : { path: file.path, index: '.', worktree: file.status, untracked: false }
}

function menuAt(e: React.MouseEvent): { x: number; y: number } {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

/**
 * The side bar for the WIP row while lanes are on: each applied lane with its
 * share of the uncommitted changes and a commit box of its own, then the
 * lanes that are set aside. Files are dragged between lanes or moved from
 * their menu; single lines move from the file's diff.
 */
export default function LanesView({ status, actions, activeFile, onOpenFile }: Props): JSX.Element {
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const appliedLanes = status.lanes.filter((l) => l.applied)
  const unapplied = status.lanes.filter((l) => !l.applied)
  const fileCount = new Set(status.files.map((f) => f.path)).size

  const moveTargets = (file: LaneFile): ContextMenuItem[] =>
    appliedLanes
      .filter((l) => l.name !== file.lane)
      .map((l) => ({
        id: `move-${l.name}`,
        label: `Move to ${l.name}`,
        onSelect: () => actions.move(l.name, { files: [{ path: file.path, fromLane: file.lane }] })
      }))

  const laneMenu = (lane: LaneInfo): ContextMenuItem[][] => [
    [
      { id: 'default', label: 'Make default lane', disabled: lane.isDefault, title: 'New changes go here', onSelect: () => actions.setDefaultLane(lane.name) },
      { id: 'rename', label: 'Rename…', onSelect: () => void actions.renameLane(lane.name) },
      { id: 'push', label: 'Push', disabled: lane.ahead === 0, onSelect: () => actions.pushLane(lane.name) }
    ],
    [
      { id: 'unapply', label: 'Unapply', title: 'Take it out of the working tree, setting its changes aside', onSelect: () => actions.unapplyLane(lane.name) },
      { id: 'remove', label: 'Remove from lanes', danger: true, title: 'Unapply it and stop listing it; the branch stays', onSelect: () => actions.unapplyLane(lane.name, true) }
    ]
  ]

  const mainMenu = (): ContextMenuItem[][] => [
    [
      { id: 'apply', label: 'Apply a branch as a lane…', onSelect: () => void actions.applyLane() },
      {
        id: 'undo',
        label: status.undoLabel ?? 'Undo lane change',
        disabled: !status.undoLabel,
        onSelect: actions.undo
      }
    ],
    [{ id: 'leave', label: 'Turn off lanes…', onSelect: () => void actions.leave() }]
  ]

  const commit = async (lane: string): Promise<void> => {
    const message = messages[lane] ?? ''
    if (!message.trim()) return
    if (await actions.commitLane(lane, message)) setMessages((m) => ({ ...m, [lane]: '' }))
  }

  const renderFile = (file: LaneFile): JSX.Element => {
    const active = activeFile?.path === file.path && !activeFile.staged
    return (
      <li key={file.path}>
        <div
          className={`file-row lane-file ${active ? 'active' : ''}`}
          aria-current={active}
          tabIndex={-1}
          draggable
          title={`${file.path}\nDrag to another lane, or right-click to move it`}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ path: file.path, fromLane: file.lane }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => onOpenFile(asFileStatus(file), false)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({
              x: e.clientX,
              y: e.clientY,
              sections: [[{ id: 'open', label: 'Open diff', onSelect: () => onOpenFile(asFileStatus(file), false) }], moveTargets(file)]
            })
          }}
        >
          <span className={`status-code code-${file.untracked ? 'U' : file.status}`}>{file.untracked ? 'U' : file.status}</span>
          <span className="file-path">{file.path}</span>
          {(file.added > 0 || file.removed > 0) && (
            <span className="lane-file-counts" aria-label={`${file.added} added, ${file.removed} removed`}>
              {file.added > 0 && <span className="lane-added">+{file.added}</span>}
              {file.removed > 0 && <span className="lane-removed">−{file.removed}</span>}
            </span>
          )}
        </div>
      </li>
    )
  }

  const renderLane = (lane: LaneInfo): JSX.Element => {
    const files = status.files.filter((f) => f.lane === lane.name)
    const message = messages[lane.name] ?? ''
    const canCommit = files.length > 0 && message.trim().length > 0
    return (
      <section
        key={lane.name}
        className={`lane ${dropTarget === lane.name ? 'drop-target' : ''}`}
        style={{ '--lane-color': laneColor(lane.color) } as React.CSSProperties}
        aria-label={`Lane ${lane.name}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dropTarget !== lane.name) setDropTarget(lane.name)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
        }}
        onDrop={(e) => {
          setDropTarget(null)
          const raw = e.dataTransfer.getData(DRAG_TYPE)
          if (!raw) return
          e.preventDefault()
          const { path, fromLane } = JSON.parse(raw) as { path: string; fromLane: string }
          if (fromLane !== lane.name) actions.move(lane.name, { files: [{ path, fromLane }] })
        }}
      >
        <div className="lane-header">
          <span className="lane-swatch" aria-hidden="true" />
          <span className="lane-name" title={lane.name}>
            {lane.name}
          </span>
          {lane.isDefault && (
            <span className="lane-default" title="New changes go to this lane">
              ★
            </span>
          )}
          {lane.ahead > 0 && (
            <span className="lane-chip" title={`${lane.ahead} commit${lane.ahead === 1 ? '' : 's'} on top of ${status.base}`}>
              {lane.ahead} commit{lane.ahead === 1 ? '' : 's'}
            </span>
          )}
          {lane.unpushed > 0 && (
            <button
              className="link-button lane-push"
              title={lane.upstream ? `Push ${lane.unpushed} commit${lane.unpushed === 1 ? '' : 's'} to ${lane.upstream}` : `Push ${lane.name} for the first time`}
              onClick={() => actions.pushLane(lane.name)}
            >
              Push ↑{lane.unpushed}
            </button>
          )}
          <button
            className="icon-button lane-menu-button"
            aria-label={`${lane.name} actions`}
            title="Lane actions"
            onClick={(e) => setMenu({ ...menuAt(e), sections: laneMenu(lane) })}
          >
            ⋯
          </button>
        </div>
        {files.length === 0 ? (
          <div className="lane-empty">No uncommitted changes. Drag files here.</div>
        ) : (
          <ul className="file-list" aria-label={`Changes in ${lane.name}`}>
            {files.map(renderFile)}
          </ul>
        )}
        {files.length > 0 && (
          <div className="lane-commit">
            <textarea
              placeholder={`Commit message for ${lane.name}`}
              aria-label={`Commit message for ${lane.name}`}
              value={message}
              onChange={(e) => setMessages((m) => ({ ...m, [lane.name]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isPrimary(e.nativeEvent) && canCommit) {
                  e.preventDefault()
                  void commit(lane.name)
                }
              }}
            />
            <button className="commit-button" disabled={!canCommit} onClick={() => void commit(lane.name)} title={`${MOD}Enter`}>
              Commit to {lane.name}
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="lanes-view">
      <div className="detail-header-row lanes-header">
        <span>
          Lanes on {status.base} · {fileCount} file{fileCount === 1 ? '' : 's'} changed
        </span>
        <span className="lanes-header-actions">
          <button className="link-button" onClick={() => void actions.createLane()}>
            + Lane
          </button>
          <button
            className="icon-button"
            aria-label="Lanes actions"
            title="More"
            onClick={(e) => setMenu({ ...menuAt(e), sections: mainMenu() })}
          >
            ⋯
          </button>
        </span>
      </div>
      <Drift status={status} actions={actions} />
      {!status.drift && appliedLanes.map(renderLane)}
      {unapplied.length > 0 && (
        <div className="detail-section lanes-unapplied">
          <div className="detail-section-header">
            <span>Unapplied ({unapplied.length})</span>
          </div>
          <ul className="side-list">
            {unapplied.map((lane) => (
              <li key={lane.name} className="lane-unapplied-row">
                <span className="lane-swatch" style={{ background: laneColor(lane.color) }} aria-hidden="true" />
                <span className="file-path">{lane.name}</span>
                {lane.hasSavedChanges && (
                  <span className="lane-chip" title="Uncommitted changes set aside while it was unapplied">
                    saved changes
                  </span>
                )}
                <button className="link-button" onClick={() => void actions.applyLane(lane.name)} disabled={!!status.drift}>
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} sections={menu.sections} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** What changed outside SillyGit, and the ways out. */
function Drift({ status, actions }: { status: LanesStatus; actions: Lanes }): JSX.Element | null {
  const { drift } = status
  const target = status.lanes.find((l) => l.isDefault && l.applied)?.name ?? status.lanes.find((l) => l.applied)?.name
  if (!drift) return null
  return (
    <div className="lanes-drift" role="alert">
      {drift.kind === 'switched' && (
        <>
          <p>
            {drift.branch ? `${drift.branch} was checked out` : 'HEAD moved'} outside the lanes, so they’re on hold. Go back to
            them, or turn lanes off and stay here (lane branches and set-aside changes are kept).
          </p>
          <div className="lanes-drift-actions">
            <button onClick={actions.returnToWorkspace}>Back to lanes</button>
            <button onClick={actions.forget}>Turn lanes off</button>
          </div>
        </>
      )}
      {drift.kind === 'commits' && (
        <>
          <p>
            {drift.count} commit{drift.count === 1 ? ' was' : 's were'} made on the workspace outside SillyGit. Move{' '}
            {drift.count === 1 ? 'it' : 'them'} into a lane to carry on.
          </p>
          <div className="lanes-drift-actions">
            {status.lanes
              .filter((l) => l.applied)
              .map((l) => (
                <button key={l.name} onClick={() => actions.adoptCommits(l.name)} className={l.name === target ? 'primary' : ''}>
                  Move to {l.name}
                </button>
              ))}
          </div>
        </>
      )}
      {drift.kind === 'lanes-moved' && (
        <>
          <p>
            {drift.lanes.join(', ')} moved outside SillyGit (a pull or reset, or the branch went away). Update the workspace to
            match.
          </p>
          <div className="lanes-drift-actions">
            <button onClick={actions.refreshWorkspace}>Update workspace</button>
          </div>
        </>
      )}
    </div>
  )
}
