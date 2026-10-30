import { useEffect, useState, type JSX } from 'react'
import type { FileStatus } from '../../../../shared/types'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'
import Avatar from '../Avatar'
import CoAuthorPicker from './CoAuthorPicker'
import { addCoAuthor, hasMessage, parseCoAuthors, removeCoAuthor, type Person } from '../../../../shared/coAuthors'
import { isPrimary, MOD } from '../../lib/shortcuts'
import { applyPrefix, bumpVersion, COMMIT_PREFIXES, type BumpKind, type QuickMessage } from '../../../../shared/quickActions'

/**
 * The commit message box on the WIP row: rule-based quick actions (suggested
 * messages, version bumps, prefixes), a Claude-generated message, co-authors
 * (kept as `Co-authored-by:` trailers in the message itself), Amend, and
 * Commit (Cmd/Ctrl+Enter).
 */
export default function CommitBox({
  repoPath,
  staged,
  commitMessage,
  onCommitMessageChange,
  onStage,
  onCommit,
  amend,
  onAmendChange,
  onAbsorb
}: {
  repoPath: string
  staged: FileStatus[]
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (paths: string[]) => void
  onCommit: () => void
  amend: boolean
  onAmendChange: (amend: boolean) => void
  onAbsorb: () => void
}): JSX.Element {
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [quickMenu, setQuickMenu] = useState<{ x: number; y: number } | null>(null)
  const [indexSuggestions, setSuggestions] = useState<QuickMessage[]>([])
  const [packageVersion, setPackageVersion] = useState<string | null>(null)
  const [coAuthorAnchor, setCoAuthorAnchor] = useState<DOMRect | null>(null)
  const coAuthors = parseCoAuthors(commitMessage)

  // Amending can just reword the last commit, with nothing staged. Trailers alone aren't a message.
  const canCommit = hasMessage(commitMessage) && (amend || staged.length > 0)

  // A suggested or generated message replaces what's typed, but keeps the co-authors.
  const replaceMessage = (message: string): void => onCommitMessageChange(coAuthors.reduce(addCoAuthor, message))

  const toggleCoAuthor = (person: Person): void => {
    const credited = coAuthors.some((p) => p.email.toLowerCase() === person.email.toLowerCase())
    onCommitMessageChange(credited ? removeCoAuthor(commitMessage, person.email) : addCoAuthor(commitMessage, person))
  }

  // Rule-based suggestions are cheap (no AI), so recompute whenever the index changes.
  const stagedKey = staged.map((f) => `${f.index}${f.path}`).join('\n')
  const suggestions = stagedKey ? indexSuggestions : []
  useEffect(() => {
    let cancelled = false
    if (stagedKey) {
      window.api.quickSuggestMessages(repoPath).then((res) => !cancelled && setSuggestions(res.ok ? res.data : []))
    }
    window.api.quickPackageVersion(repoPath).then((res) => !cancelled && setPackageVersion(res.ok ? res.data : null))
    return () => {
      cancelled = true
    }
  }, [repoPath, stagedKey])

  const handleBump = async (kind: BumpKind): Promise<void> => {
    setGenerateError(null)
    const res = await window.api.quickBumpVersion(repoPath, kind)
    if (!res.ok) {
      setGenerateError(res.error)
      return
    }
    replaceMessage(res.data.message)
    onStage(res.data.files)
  }

  const quickMenuSections = (): ContextMenuItem[][] => {
    const sections: ContextMenuItem[][] = []
    if (suggestions.length > 0) {
      sections.push(
        suggestions.map((s) => ({
          id: `suggest-${s.id}`,
          label: s.label,
          title: s.message,
          onSelect: () => replaceMessage(s.message)
        }))
      )
    }
    const tools: ContextMenuItem[] = []
    const kinds: BumpKind[] = ['patch', 'minor', 'major']
    const bumps = packageVersion ? kinds.filter((k) => bumpVersion(packageVersion, k)) : []
    if (packageVersion && bumps.length > 0) {
      tools.push({
        id: 'bump',
        label: `Bump version (${packageVersion})`,
        submenu: bumps.map((k) => ({
          id: `bump-${k}`,
          label: `${k[0].toUpperCase()}${k.slice(1)} → ${bumpVersion(packageVersion, k)}`,
          onSelect: () => void handleBump(k)
        }))
      })
    }
    tools.push({
      id: 'prefix',
      label: 'Prefix with',
      submenu: COMMIT_PREFIXES.map((p) => ({
        id: `prefix-${p}`,
        label: `${p}:`,
        onSelect: () => onCommitMessageChange(applyPrefix(commitMessage, p))
      }))
    })
    sections.push(tools)
    return sections
  }

  const handleGenerateMessage = async (): Promise<void> => {
    setGenerating(true)
    setGenerateError(null)
    const res = await window.api.aiGenerateCommitMessage(repoPath)
    setGenerating(false)
    if (res.ok) replaceMessage(res.data)
    else setGenerateError(res.error)
  }

  return (
    <div className="commit-box" data-tour="commit-box">
      <div className="commit-box-toolbar">
        <button
          className="link-button"
          title="Fill in a message from simple rules (no AI)"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setQuickMenu({ x: r.left, y: r.bottom + 4 })
          }}
        >
          Quick actions ▾
        </button>
        <button className="link-button" disabled={staged.length === 0 || generating} onClick={handleGenerateMessage}>
          {generating ? 'Generating…' : 'Generate message'}
        </button>
        <button
          className="link-button"
          disabled={staged.length === 0}
          onClick={onAbsorb}
          title="Fold each staged change into the earlier commit it fixes"
        >
          Absorb…
        </button>
        <button
          className="link-button"
          title="Credit others with Co-authored-by trailers"
          aria-haspopup="dialog"
          onClick={(e) => setCoAuthorAnchor(e.currentTarget.getBoundingClientRect())}
        >
          Co-authors{coAuthors.length > 0 ? ` (${coAuthors.length})` : ''}…
        </button>
      </div>
      {coAuthors.length > 0 && (
        <ul className="co-author-chips" aria-label="Co-authors">
          {coAuthors.map((p) => (
            <li key={p.email.toLowerCase()} className="co-author-chip" title={`${p.name} <${p.email}>`}>
              <Avatar name={p.name} email={p.email} repoPath={repoPath} size={16} />
              <span className="co-author-name">{p.name}</span>
              <button
                className="co-author-remove"
                aria-label={`Remove co-author ${p.name}`}
                onClick={() => onCommitMessageChange(removeCoAuthor(commitMessage, p.email))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {generateError && <div className="ai-error">{generateError}</div>}
      {suggestions.length > 0 && !hasMessage(commitMessage) && (
        <button
          className="quick-suggestion"
          title="Use this message (no AI)"
          onClick={() => replaceMessage(suggestions[0].message)}
        >
          <span className="quick-suggestion-label">Use</span> {suggestions[0].message.split('\n')[0]}
        </button>
      )}
      <textarea
        placeholder={amend ? 'Amended commit message' : 'Commit message'}
        aria-label="Commit message"
        value={commitMessage}
        onChange={(e) => onCommitMessageChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isPrimary(e.nativeEvent) && canCommit) {
            e.preventDefault()
            onCommit()
          }
        }}
      />
      <label className="amend-toggle" title="Replace the last commit with these changes and this message">
        <input type="checkbox" checked={amend} onChange={(e) => onAmendChange(e.target.checked)} />
        Amend previous commit
      </label>
      <button className="commit-button" disabled={!canCommit} onClick={onCommit} title={`${MOD}Enter`}>
        {amend ? 'Amend Commit' : 'Commit'} {staged.length > 0 ? `(${staged.length})` : ''}
      </button>
      {coAuthorAnchor && (
        <CoAuthorPicker
          repoPath={repoPath}
          anchor={coAuthorAnchor}
          credited={coAuthors}
          onToggle={toggleCoAuthor}
          onClose={() => setCoAuthorAnchor(null)}
        />
      )}
      {quickMenu && (
        <ContextMenu x={quickMenu.x} y={quickMenu.y} sections={quickMenuSections()} onClose={() => setQuickMenu(null)} />
      )}
    </div>
  )
}
