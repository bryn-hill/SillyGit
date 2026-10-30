import { useId, useState, type JSX } from 'react'
import type { RepoStatus, StashPushOptions } from '../../../shared/types'

interface Props {
  status: RepoStatus | null
  /** The files picked to start with; every change when null. */
  initialPaths: string[] | null
  onStash: (options: StashPushOptions) => void
  onClose: () => void
}

interface Change {
  path: string
  origPath?: string
  untracked: boolean
  staged: boolean
  unstaged: boolean
}

/** Every changed file once, staged or not, in the order the side bar lists them. */
function changesOf(status: RepoStatus | null): Change[] {
  const byPath = new Map<string, Change>()
  for (const [list, staged] of [
    [status?.unstaged ?? [], false],
    [status?.staged ?? [], true]
  ] as const) {
    for (const f of list) {
      const c = byPath.get(f.path) ?? { path: f.path, untracked: false, staged: false, unstaged: false }
      if (f.origPath) c.origPath = f.origPath
      if (f.untracked) c.untracked = true
      if (staged) c.staged = true
      else c.unstaged = true
      byPath.set(f.path, c)
    }
  }
  return [...byPath.values()]
}

/**
 * "Stash…": pick which changed files to stash, name the stash, and optionally
 * keep the staged changes in the working tree as well (`--keep-index`).
 */
export default function StashDialog({ status, initialPaths, onStash, onClose }: Props): JSX.Element {
  const ids = useId()
  const changes = changesOf(status)
  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPaths ?? changes.map((c) => c.path)))
  const [keepIndex, setKeepIndex] = useState(false)
  // Files can leave the working tree while this is open; only those still there count.
  const chosen = changes.filter((c) => picked.has(c.path))
  const all = chosen.length === changes.length
  const anyStaged = changes.some((c) => c.staged)

  const toggle = (path: string, on: boolean): void =>
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })

  const submit = (): void => {
    if (chosen.length === 0) return
    onStash({
      message: message.trim() || undefined,
      // A rename is stashed whole, so its old path goes too.
      paths: all ? undefined : chosen.flatMap((c) => (c.origPath ? [c.path, c.origPath] : [c.path])),
      keepIndex: keepIndex && anyStaged
    })
  }

  const label = all ? 'Stash all changes' : `Stash ${chosen.length} ${chosen.length === 1 ? 'file' : 'files'}`

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stash-modal"
        role="dialog"
        aria-label="Stash changes"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="modal-header">
          <span>Stash changes</span>
          <button className="icon-button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-label" htmlFor={`${ids}-message`}>
            Stash message
          </label>
          <input
            id={`${ids}-message`}
            autoFocus
            value={message}
            placeholder="Optional"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <div className="stash-modal-files-header">
            <span className="modal-label">Files</span>
            <button
              className="link-button"
              onClick={() => setPicked(all ? new Set() : new Set(changes.map((c) => c.path)))}
            >
              {all ? 'Select none' : 'Select all'}
            </button>
          </div>
          <ul className="stash-modal-files" aria-label="Files to stash">
            {changes.map((c) => (
              <li key={c.path}>
                <label title={c.path}>
                  <input type="checkbox" checked={picked.has(c.path)} onChange={(e) => toggle(c.path, e.target.checked)} />
                  <span className="stash-modal-path">{c.path}</span>
                  {c.untracked && <span className="stash-modal-tag">untracked</span>}
                  {c.staged && <span className="stash-modal-tag">staged</span>}
                </label>
              </li>
            ))}
          </ul>
          <label className="stash-modal-option" title={anyStaged ? undefined : 'Nothing is staged'}>
            <input
              type="checkbox"
              checked={keepIndex && anyStaged}
              disabled={!anyStaged}
              onChange={(e) => setKeepIndex(e.target.checked)}
            />
            Keep staged changes in the working tree too
          </label>
        </div>
        <div className="modal-footer">
          <button className="subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="commit-button" disabled={chosen.length === 0} onClick={submit}>
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
