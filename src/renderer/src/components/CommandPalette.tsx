import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { matchScore } from '../lib/shortcuts'

export interface Command {
  id: string
  label: string
  /** Shown dimmed on the right, e.g. "⌘Z". */
  shortcut?: string
  /** Grouping word shown before the label, e.g. "Branch". */
  group?: string
  run: () => void
}

interface Props {
  commands: Command[]
  onClose: () => void
}

const MAX_RESULTS = 60

/** A searchable list of everything the app can do, opened with Cmd/Ctrl+K. */
export default function CommandPalette({ commands, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, MAX_RESULTS)
    return commands
      .map((command) => ({
        command,
        score: matchScore(`${command.group ?? ''} ${command.label}`, query)
      }))
      .filter((r): r is { command: Command; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.command)
  }, [commands, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (command: Command | undefined): void => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="palette-input"
          placeholder="Type a command or branch name"
          aria-label="Command"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[active])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <ul className="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className="palette-empty">No matching commands</li>}
          {results.map((command, i) => (
            <li
              key={command.id}
              role="option"
              aria-selected={i === active}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseMove={() => setActive(i)}
              onClick={() => run(command)}
            >
              {command.group && <span className="palette-group">{command.group}</span>}
              <span className="palette-label">{command.label}</span>
              {command.shortcut && <kbd className="palette-shortcut">{command.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
