import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import {
  REBASE_ACTIONS,
  defaultGroupMessage,
  groupOf,
  groupNeedsMessage,
  groupSteps,
  isNoop,
  validateSteps,
  type RebaseAction,
  type RebaseCommit,
  type RebasePlan,
  type RebaseStep
} from '../../../shared/rebase'
import Avatar from './Avatar'
import Select from './Select'

interface Row {
  commit: RebaseCommit
  action: RebaseAction
  /** The message typed for the commit this row starts, if any. */
  message?: string
}

interface Props {
  repoPath: string
  base: string
  onClose: () => void
  /** Runs the plan; resolves to false when it didn't start, so the editor stays open. */
  onStart: (plan: RebasePlan, steps: RebaseStep[]) => Promise<boolean>
}

const ACTION_KEYS: Record<string, RebaseAction> = { p: 'pick', r: 'reword', s: 'squash', f: 'fixup', d: 'drop' }

const ACTION_LABELS: Record<RebaseAction, string> = {
  pick: 'Pick',
  reword: 'Reword',
  squash: 'Squash',
  fixup: 'Fixup',
  drop: 'Drop'
}

/** Rows newest first, as the graph shows them; git wants them oldest first. */
const toSteps = (rows: Row[]): RebaseStep[] =>
  [...rows].reverse().map((r) => ({ hash: r.commit.hash, action: r.action, message: r.message }))

const initialRows = (plan: RebasePlan): Row[] => [...plan.commits].reverse().map((commit) => ({ commit, action: 'pick' }))

/**
 * GitKraken-style interactive rebase: the branch's commits after the chosen
 * one, newest at the top. Drag them (or Alt+Up/Down) to reorder, pick an
 * action for each, type the messages for rewords and squashes, then start.
 */
export default function InteractiveRebase({ repoPath, base, onClose, onStart }: Props): JSX.Element {
  const [plan, setPlan] = useState<RebasePlan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.planInteractiveRebase(repoPath, base).then((res) => {
      if (cancelled) return
      if (!res.ok) return setLoadError(res.error)
      setPlan(res.data)
      setRows(initialRows(res.data))
      setSelected(res.data.commits[res.data.commits.length - 1]?.hash ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, base])

  const messages = useMemo(() => new Map(plan?.commits.map((c) => [c.hash, c.message])), [plan])
  const messageOf = (hash: string): string => messages.get(hash) ?? ''
  const steps = toSteps(rows)
  const groups = groupSteps(steps)
  const invalid = validateSteps(steps, messageOf)
  const noop = plan ? isNoop(steps, plan.commits.map((c) => c.hash), messageOf) : true

  const selectedGroup = selected ? groupOf(steps, selected) : undefined
  const editing = selectedGroup && groupNeedsMessage(selectedGroup) ? selectedGroup : undefined
  const editingValue = editing ? (editing.head.message ?? defaultGroupMessage(editing, messageOf)) : ''

  const update = (hash: string, change: Partial<Row>): void =>
    setRows((current) => current.map((r) => (r.commit.hash === hash ? { ...r, ...change } : r)))

  const setAction = (hash: string, action: RebaseAction): void => {
    update(hash, { action })
    setSelected(hash)
  }

  const move = (hash: string, to: number): void =>
    setRows((current) => {
      const from = current.findIndex((r) => r.commit.hash === hash)
      if (from < 0) return current
      const next = [...current]
      const [row] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(to, next.length)), 0, row)
      return next
    })

  const focusRow = (hash: string): void => {
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-hash="${hash}"]`)?.focus())
  }

  const onRowKeyDown = (e: React.KeyboardEvent, index: number, hash: string): void => {
    if (e.target instanceof HTMLElement && e.target.closest('[role="combobox"]')) return
    const key = e.key.toLowerCase()
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      move(hash, index + (e.key === 'ArrowUp' ? -1 : 1))
      focusRow(hash)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = rows[index + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        setSelected(next.commit.hash)
        focusRow(next.commit.hash)
      }
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && ACTION_KEYS[key]) {
      e.preventDefault()
      setAction(hash, ACTION_KEYS[key])
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const start = async (): Promise<void> => {
    if (!plan || invalid || noop) return
    setStarting(true)
    try {
      await onStart(plan, steps)
    } finally {
      setStarting(false)
    }
  }

  // Where the dragged row would land, from the pointer's place over a row.
  const onDragOver = (e: React.DragEvent, index: number): void => {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDropIndex(e.clientY < box.top + box.height / 2 ? index : index + 1)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    if (dragging && dropIndex !== null) {
      const from = rows.findIndex((r) => r.commit.hash === dragging)
      move(dragging, dropIndex > from ? dropIndex - 1 : dropIndex)
      setSelected(dragging)
    }
    setDragging(null)
    setDropIndex(null)
  }

  // The commit a squash or fixup goes into: the next kept row below it.
  const intoOf = (index: number): RebaseCommit | undefined =>
    rows.slice(index + 1).find((r) => r.action !== 'drop' && r.action !== 'squash' && r.action !== 'fixup')?.commit

  return (
    <div className="interactive-rebase" role="region" aria-label="Interactive rebase">
      <div className="merge-toolbar">
        <span className="merge-title">Interactive rebase</span>
        {plan && (
          <span className="merge-dim">
            {plan.branch} onto {plan.base.shortHash} {plan.base.subject}
          </span>
        )}
        <span className="merge-toolbar-spacer" />
        {plan && (
          <span className="merge-dim" data-testid="rebase-summary">
            {plan.commits.length} commit{plan.commits.length === 1 ? '' : 's'} → {groups.length}
          </span>
        )}
        <button
          className="link-button"
          disabled={!plan}
          onClick={() => {
            if (!plan) return
            setRows(initialRows(plan))
          }}
        >
          Reset
        </button>
        <button onClick={onClose}>Cancel</button>
        <button
          className="merge-save-button"
          disabled={!plan || !!invalid || noop || starting}
          title={invalid ?? (noop ? 'Nothing to change yet' : undefined)}
          onClick={start}
        >
          Start Rebase
        </button>
        <button className="icon-button" title="Close (Esc)" aria-label="Close interactive rebase" onClick={onClose}>
          ✕
        </button>
      </div>
      {loadError && <div className="commit-fullview-empty">{loadError}</div>}
      {!plan && !loadError && <div className="commit-fullview-empty">Loading commits…</div>}
      {plan && (
        <div className="rebase-body">
          <div className="rebase-hint">
            Drag commits to reorder them, newest at the top. Keys: <kbd>P</kbd> pick, <kbd>R</kbd> reword,{' '}
            <kbd>S</kbd> squash, <kbd>F</kbd> fixup, <kbd>D</kbd> drop, <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move.
          </div>
          <div
            className="rebase-list"
            role="list"
            aria-label="Commits to rebase"
            ref={listRef}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null)
            }}
          >
            {rows.map((row, index) => {
              const { commit, action } = row
              const into = action === 'squash' || action === 'fixup' ? intoOf(index) : undefined
              const dropBefore = dropIndex === index
              const dropAfter = dropIndex === rows.length && index === rows.length - 1
              return (
                <div
                  key={commit.hash}
                  role="listitem"
                  aria-label={commit.subject}
                  data-hash={commit.hash}
                  data-action={action}
                  tabIndex={0}
                  draggable
                  className={[
                    'rebase-row',
                    `rebase-${action}`,
                    selected === commit.hash ? 'selected' : '',
                    dragging === commit.hash ? 'dragging' : '',
                    dropBefore ? 'drop-before' : '',
                    dropAfter ? 'drop-after' : ''
                  ].join(' ')}
                  onClick={() => setSelected(commit.hash)}
                  onKeyDown={(e) => onRowKeyDown(e, index, commit.hash)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', commit.hash)
                    setDragging(commit.hash)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setDropIndex(null)
                  }}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDrop={onDrop}
                >
                  <span className="rebase-grip" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <Select<RebaseAction>
                    className="rebase-action"
                    aria-label={`Action for ${commit.shortHash}`}
                    value={action}
                    onChange={(a) => setAction(commit.hash, a)}
                    options={REBASE_ACTIONS.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
                  />
                  <Avatar name={commit.author} email={commit.authorEmail} hash={commit.hash} repoPath={repoPath} size={18} />
                  <span className="rebase-hash">{commit.shortHash}</span>
                  <span className="rebase-subject" title={commit.message}>
                    {action === 'reword' && row.message !== undefined ? row.message.split('\n')[0] : commit.subject}
                  </span>
                  {into && <span className="rebase-into">into {into.shortHash}</span>}
                  <span className="rebase-author">{commit.author}</span>
                </div>
              )
            })}
            <div className="rebase-row rebase-base" aria-label="Base commit">
              <span className="rebase-grip" />
              <span className="rebase-base-label">base</span>
              <span className="rebase-hash">{plan.base.shortHash}</span>
              <span className="rebase-subject">{plan.base.subject}</span>
            </div>
          </div>
          {invalid && (
            <div className="rebase-error" role="alert">
              {invalid}
            </div>
          )}
          {editing && (
            <section className="rebase-message" aria-label="Commit message">
              <header className="merge-pane-header">
                <span className="merge-output-title">
                  {editing.members.some((m) => m.action === 'squash')
                    ? `Message for the squashed commit (${editing.members.length + 1} commits)`
                    : `New message for ${editing.head.hash.slice(0, 7)}`}
                </span>
                <span className="merge-toolbar-spacer" />
                {editing.head.message !== undefined && (
                  <button className="link-button" onClick={() => update(editing.head.hash, { message: undefined })}>
                    Use default
                  </button>
                )}
              </header>
              <textarea
                className="rebase-message-editor"
                aria-label="Commit message text"
                spellCheck={false}
                value={editingValue}
                onChange={(e) => update(editing.head.hash, { message: e.target.value })}
              />
            </section>
          )}
        </div>
      )}
    </div>
  )
}
