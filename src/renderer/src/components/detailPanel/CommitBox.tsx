import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import type { FileStatus } from '../../../../shared/types'
import ContextMenu, { type ContextMenuItem } from '../ContextMenu'
import Avatar from '../Avatar'
import CoAuthorPicker from './CoAuthorPicker'
import { addCoAuthor, hasMessage, parseCoAuthors, removeCoAuthor, type Person } from '../../../../shared/coAuthors'
import { isPrimary, MOD } from '../../lib/shortcuts'
import { bumpVersion, type BumpKind, type QuickMessage } from '../../../../shared/quickActions'
import {
  applyConventional,
  isUntouchedTemplate,
  parseConventional,
  typeChoices,
  type CommitHints
} from '../../../../shared/commitHints'

/**
 * The commit message box on the WIP row: rule-based quick actions (suggested
 * messages, version bumps), recent messages and commit.template, a
 * Conventional Commits type(scope) picker, a Claude-generated message, co-authors
 * (kept as `Co-authored-by:` trailers in the message itself), Amend, and
 * Commit (Cmd/Ctrl+Enter).
 */
export default function CommitBox({
  repoPath,
  staged,
  commitMessage,
  hints,
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
  hints: CommitHints
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
  const [recentMenu, setRecentMenu] = useState<{ x: number; y: number } | null>(null)
  const [typeMenu, setTypeMenu] = useState<{ x: number; y: number } | null>(null)
  const [indexSuggestions, setSuggestions] = useState<QuickMessage[]>([])
  const [packageVersion, setPackageVersion] = useState<string | null>(null)
  const [coAuthorAnchor, setCoAuthorAnchor] = useState<DOMRect | null>(null)
  const coAuthors = parseCoAuthors(commitMessage)

  // Amending can just reword the last commit, with nothing staged. Trailers alone aren't a message.
  // An untouched commit.template isn't a message either.
  const canCommit =
    hasMessage(commitMessage) && !isUntouchedTemplate(commitMessage, hints.template) && (amend || staged.length > 0)

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
    sections.push(tools)
    return sections
  }

  const recentMenuSections = (): ContextMenuItem[][] => {
    const sections: ContextMenuItem[][] = []
    if (hints.recent.length > 0) {
      sections.push(
        hints.recent.map((message, i) => ({
          id: `recent-${i}`,
          label: message.split('\n')[0],
          title: message,
          onSelect: () => replaceMessage(message)
        }))
      )
    }
    if (hints.template) {
      sections.push([
        { id: 'template', label: 'Commit template', title: hints.template, onSelect: () => replaceMessage(hints.template!) }
      ])
    }
    return sections
  }

  // The type(scope) the message starts with now, ticked in the menu.
  const current = parseConventional(commitMessage.split('\n')[0])
  const scopes = hints.scopes.slice(0, 12)
  const typeMenuSections = (): ContextMenuItem[][] => [
    typeChoices(hints.types).map((type) => {
      const pick = (scope: string | null): ContextMenuItem => {
        const label = `${type}${scope ? `(${scope})` : ''}:`
        const ticked = current?.type === type && current.scope === scope
        return {
          id: `type-${type}-${scope ?? ''}`,
          label: ticked ? `✓ ${label}` : label,
          onSelect: () => onCommitMessageChange(applyConventional(commitMessage, type, scope))
        }
      }
      return scopes.length === 0 ? pick(null) : { id: `type-${type}`, label: type, submenu: [pick(null), ...scopes.map(pick)] }
    })
  ]

  const openMenu = (open: (pos: { x: number; y: number }) => void) => (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    open({ x: r.left, y: r.bottom + 4 })
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
          onClick={openMenu(setQuickMenu)}
        >
          Quick actions ▾
        </button>
        <button
          className="link-button"
          title="Reuse one of your recent commit messages, or the commit template"
          disabled={hints.recent.length === 0 && !hints.template}
          onClick={openMenu(setRecentMenu)}
        >
          Recent ▾
        </button>
        <button
          className="link-button"
          title={
            scopes.length > 0
              ? 'Start the message with a Conventional Commits type(scope); scopes come from this repo'
              : 'Start the message with a Conventional Commits type'
          }
          onClick={openMenu(setTypeMenu)}
        >
          Type ▾
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
      {recentMenu && (
        <ContextMenu x={recentMenu.x} y={recentMenu.y} sections={recentMenuSections()} onClose={() => setRecentMenu(null)} />
      )}
      {typeMenu && (
        <ContextMenu x={typeMenu.x} y={typeMenu.y} sections={typeMenuSections()} onClose={() => setTypeMenu(null)} />
      )}
    </div>
  )
}
