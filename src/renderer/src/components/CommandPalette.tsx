import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { matchScore } from '../lib/shortcuts'

export interface Command {
  id: string
  label: string
  /** Shown dimmed on the right, e.g. "⌘Z". */
  shortcut?: string
  /** Grouping word shown before the label, e.g. "Branch". */
  group?: string
  /** Runs the command. Commands with `children` open their list instead. */
  run?: () => void
  /**
   * A sub-list to pick from, like GitKraken's "Checkout" action listing the
   * branches. Searching from the top level finds these too.
   */
  children?: Command[]
}

interface Props {
  commands: Command[]
  onClose: () => void
  /**
   * `modal` is the Cmd+K palette in the middle of the window; `dropdown` hangs
   * under the toolbar's Actions button, listing actions alphabetically.
   */
  variant?: 'modal' | 'dropdown'
  /** The id of a sub-list to open in, like Cmd+B opening straight on Checkout. */
  startIn?: string
}

const MAX_RESULTS = 60

/** Every command with its sub-commands after it, which carry their parent's label as their group. */
function flatten(commands: Command[]): Command[] {
  return commands.flatMap((command) => [
    command,
    ...(command.children ?? []).map((child) => ({ ...child, group: child.group ?? command.label }))
  ])
}

/** A searchable list of everything the app can do, opened with Cmd/Ctrl+K or the Actions button. */
export default function CommandPalette({ commands, onClose, variant = 'modal', startIn }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  /** The labels of the sub-lists opened, outermost first. */
  const [path, setPath] = useState<string[]>(() => {
    const start = startIn && commands.find((c) => c.id === startIn && c.children)
    return start ? [start.label] : []
  })
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const level = useMemo(() => {
    let list = commands
    for (const label of path) list = list.find((c) => c.label === label)?.children ?? []
    return list
  }, [commands, path])

  const results = useMemo(() => {
    if (!query.trim()) return level.slice(0, MAX_RESULTS)
    // At the top level a search reaches into the sub-lists too.
    const searchable = path.length === 0 ? flatten(level) : level
    return searchable
      .map((command) => ({
        command,
        score: matchScore(`${command.group ?? ''} ${command.label}`, query)
      }))
      .filter((r): r is { command: Command; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.command)
  }, [level, path, query])


  // Clicking into a sub-list moves focus to the list; typing should still search.
  useEffect(() => inputRef.current?.focus(), [path])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (command: Command | undefined): void => {
    if (!command) return
    if (command.children) {
      setPath((p) => [...p, command.label])
      setQuery('')
      setActive(0)
      return
    }
    onClose()
    command.run?.()
  }

  const back = (): void => {
    setPath((p) => p.slice(0, -1))
    setActive(0)
  }

  const placeholder =
    path.length > 0
      ? `Search ${path[path.length - 1].toLowerCase()}`
      : variant === 'dropdown'
        ? 'Search for commands and actions (e.g., Open Repo)'
        : 'Type a command or branch name'

  return (
    <div className={`palette-backdrop palette-backdrop-${variant}`} onMouseDown={onClose}>
      <div
        className={`palette palette-${variant}`}
        role="dialog"
        aria-label={variant === 'dropdown' ? 'Actions' : 'Command palette'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          {path.length > 0 && (
            <button className="palette-crumb" onClick={back} title="Back (Backspace)">
              ‹ {path.join(' › ')}
            </button>
          )}
          <input
            ref={inputRef}
            autoFocus
            className="palette-input"
            placeholder={placeholder}
            aria-label="Command"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
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
                if (path.length > 0) back()
                else onClose()
              } else if (e.key === 'Backspace' && query === '' && path.length > 0) {
                e.preventDefault()
                back()
              }
            }}
          />
        </div>
        <ul className="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className="palette-empty">No matching commands</li>}
          {results.map((command, i) => (
            <li
              key={`${command.group ?? ''}/${command.id}`}
              role="option"
              aria-selected={i === active}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseMove={() => setActive(i)}
              onClick={() => run(command)}
            >
              {command.group && <span className="palette-group">{command.group}</span>}
              <span className="palette-label">{command.label}</span>
              {command.shortcut && <kbd className="palette-shortcut">{command.shortcut}</kbd>}
              {command.children && <span className="palette-more">›</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
