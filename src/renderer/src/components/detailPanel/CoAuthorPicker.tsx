import { useEffect, useId, useState, type JSX } from 'react'
import Avatar from '../Avatar'
import {
  filterCandidates,
  formatPerson,
  parsePerson,
  type CoAuthorCandidate,
  type Person
} from '../../../../shared/coAuthors'

const WIDTH = 300
const MARGIN = 8

/**
 * The "Add co-authors" popover above the commit box: everyone who has
 * committed to the repo (from `git shortlog`), filtered as you type, or
 * anyone typed as "Name <email>". Picking someone toggles their trailer.
 */
export default function CoAuthorPicker({
  repoPath,
  anchor,
  credited,
  onToggle,
  onClose
}: {
  repoPath: string
  /** The button it opened from; the popover sits just above it. */
  anchor: DOMRect
  credited: Person[]
  onToggle: (person: Person) => void
  onClose: () => void
}): JSX.Element {
  const [candidates, setCandidates] = useState<CoAuthorCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  useEffect(() => {
    let cancelled = false
    window.api.coAuthorCandidates(repoPath).then((res) => {
      if (cancelled) return
      setCandidates(res.ok ? res.data : [])
      setError(res.ok ? null : res.error)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const typed = parsePerson(query)
  const matches: Person[] = filterCandidates(candidates ?? [], query)
  const options = typed && !matches.some((p) => p.email.toLowerCase() === typed.email.toLowerCase()) ? [typed, ...matches] : matches
  const shownActive = Math.min(active, Math.max(0, options.length - 1))
  const isCredited = (p: Person): boolean => credited.some((c) => c.email.toLowerCase() === p.email.toLowerCase())

  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN))
  const bottom = Math.max(MARGIN, window.innerHeight - anchor.top + 4)

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} />
      <div className="co-author-picker" role="dialog" aria-label="Add co-authors" style={{ left, bottom, width: WIDTH }}>
        <input
          autoFocus
          role="combobox"
          aria-label="Search co-authors"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={options.length > 0 ? `${listId}-${shownActive}` : undefined}
          placeholder="Name, email, or Name <email>"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : -1
              setActive((shownActive + step + options.length) % Math.max(1, options.length))
            } else if (e.key === 'Enter' && options[shownActive]) {
              e.preventDefault()
              onToggle(options[shownActive])
              setQuery('')
            }
          }}
        />
        <ul className="co-author-list" id={listId} role="listbox" aria-label="Co-authors" aria-multiselectable>
          {options.map((p, i) => (
            <li
              key={p.email.toLowerCase()}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={isCredited(p)}
              className={`co-author-option ${i === shownActive ? 'active' : ''}`}
              title={formatPerson(p)}
              onMouseEnter={() => setActive(i)}
              onClick={() => onToggle(p)}
            >
              <span className="co-author-check" aria-hidden>
                {isCredited(p) ? '✓' : ''}
              </span>
              <Avatar name={p.name} email={p.email} repoPath={repoPath} size={20} />
              <span className="co-author-name">{p.name}</span>
              <span className="co-author-email">{p === typed ? 'Add' : p.email}</span>
            </li>
          ))}
        </ul>
        {candidates === null && <div className="co-author-empty">Loading…</div>}
        {candidates !== null && options.length === 0 && (
          <div className="co-author-empty">{error ?? (query ? 'Nobody matches. Type Name <email> to add someone new.' : 'Nobody else has committed here yet. Type Name <email>.')}</div>
        )}
      </div>
    </>
  )
}
