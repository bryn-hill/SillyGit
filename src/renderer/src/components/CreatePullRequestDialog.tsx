import { useEffect, useId, useRef, useState, type JSX } from 'react'
import { flushSync } from 'react-dom'
import {
  baseChoices,
  createProblem,
  defaultBase,
  headChoices,
  headRemoteBranch,
  parseReviewers,
  type CreatedPullRequest,
  type HeadChoice,
  newPullRequestWebUrl,
  pullRequestHostLabel
} from '../../../shared/createPullRequest'
import { withPullRequestText } from '../../../shared/quickActions'
import { isAzureWebUrl } from '../../../shared/azure'
import type { BranchInfo, RepoRemote } from '../../../shared/types'
import Select from './Select'

/** What the branch menu (or the palette) asked to open a pull request for. */
export interface CreatePullRequestRequest {
  /** The branch to merge, as the graph names it: "feature/x" or "origin/feature/x". */
  head: string
  /** The branch on the remote it goes into, if one was implied (the checked-out branch). */
  base: string | null
  remote: string
}

interface Props {
  repoPath: string
  branches: BranchInfo[]
  remotes: RepoRemote[]
  request: CreatePullRequestRequest
  onCreated: (pr: CreatedPullRequest) => void
  onOpenUrl: (url: string) => void
  onClose: () => void
}

const MAX_SUGGESTIONS = 8

function headStateText(head: HeadChoice): string | null {
  const { state } = head
  if (state.kind === 'unpublished') return `${head.ref} isn't on ${head.remote} yet.`
  if (state.kind === 'ahead')
    return `${head.ref} has ${state.ahead} ${state.ahead === 1 ? 'commit' : 'commits'} that ${head.remote} doesn't have yet.`
  return null
}

/**
 * Opens a GitHub pull request without leaving the app: pick the branches,
 * edit the title and description (filled in from the commits by rule), mark
 * it a draft or ask for reviews. A head that isn't fully pushed gets pushed
 * first.
 */
export default function CreatePullRequestDialog({
  repoPath,
  branches,
  remotes,
  request,
  onCreated,
  onOpenUrl,
  onClose
}: Props): JSX.Element {
  const ids = useId()
  const { remote } = request
  const heads = headChoices(branches, remotes, remote)
  const bases = baseChoices(branches, remotes, remote)
  // A remote branch that a local one tracks is offered as the local one, which is what gets pushed.
  const [headRef, setHeadRef] = useState(
    () => branches.find((b) => !b.remote && b.upstream === request.head)?.name ?? request.head
  )
  const head = heads.find((h) => h.ref === headRef) ?? null
  const headBranch = head ? headRemoteBranch(head) : null
  // The base the user picked; until then the one asked for, or the repo's usual one.
  const [pickedBase, setBase] = useState<string | null>(null)
  const base = pickedBase && bases.includes(pickedBase) ? pickedBase : defaultBase(bases, request.base, headBranch)

  // Title and description from the commits, for the branches shown; null fields aren't edited yet.
  const [prefill, setPrefill] = useState<{ key: string; title: string; body: string } | null>(null)
  const [editedTitle, setTitle] = useState<string | null>(null)
  const [editedBody, setBody] = useState<string | null>(null)
  const shownHead = head?.ref ?? null
  const textKey = base && shownHead ? `${base}\0${shownHead}` : null
  const prefilled = prefill && prefill.key === textKey ? prefill : null
  const title = editedTitle ?? prefilled?.title ?? ''
  const body = editedBody ?? prefilled?.body ?? ''

  const [draft, setDraft] = useState(false)
  const [reviewersText, setReviewersText] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [pushFirst, setPushFirst] = useState(true)
  const [step, setStep] = useState<'pushing' | 'creating' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!textKey || !base || !shownHead || !headBranch) return
    let current = true
    window.api.quickPullRequestText(repoPath, `${remote}/${base}`, shownHead, headBranch).then((res) => {
      if (current && res.ok) setPrefill({ key: textKey, ...res.data })
    })
    return () => {
      current = false
    }
  }, [repoPath, remote, base, shownHead, headBranch, textKey])

  useEffect(() => {
    let current = true
    window.api.prSuggestedReviewers(repoPath).then((res) => {
      if (current && res.ok) setSuggestions(res.data)
    })
    return () => {
      current = false
    }
  }, [repoPath])

  const reviewers = parseReviewers(reviewersText)
  // The login being typed, which the suggestions narrow down to, and the ones before it.
  const typing = (reviewersText.match(/@?([^\s,]*)$/)?.[1] ?? '').toLowerCase()
  const beforeTyping = reviewersText.replace(/@?[^\s,]*$/, '')
  const listed = new Set(parseReviewers(beforeTyping).map((r) => r.toLowerCase()))
  const shownSuggestions = suggestions
    .filter((login) => {
      const lower = login.toLowerCase()
      return !listed.has(lower) && lower !== typing && lower.startsWith(typing)
    })
    .slice(0, MAX_SUGGESTIONS)
  const reviewersInput = useRef<HTMLInputElement>(null)
  const addReviewer = (login: string): void => {
    const kept = beforeTyping.replace(/[\s,]*$/, '')
    flushSync(() => setReviewersText(`${kept}${kept ? ', ' : ''}${login}, `))
    // Back to typing, after what was just added.
    const input = reviewersInput.current
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }

  const needsPush = !!head && head.state.kind !== 'pushed'
  const mustPush = head?.state.kind === 'unpublished'
  const willPush = needsPush && (mustPush || pushFirst)
  const problem = createProblem({ base, head, title })
  const webUrl = remotes.find((r) => r.name === remote)?.webUrl ?? null
  const stateText = head ? headStateText(head) : null

  const create = async (): Promise<void> => {
    if (problem || !head || !base) return
    setError(null)
    let remoteBranch = headRemoteBranch(head)
    if (willPush) {
      setStep('pushing')
      const pushed = await window.api.pushBranch(repoPath, head.ref, remote)
      if (!pushed.ok) {
        setStep(null)
        setError(pushed.error)
        return
      }
      remoteBranch = pushed.data
    }
    setStep('creating')
    const res = await window.api.prCreate(repoPath, { base, head: remoteBranch, title, body, draft, reviewers })
    setStep(null)
    if (!res.ok) setError(res.error)
    else onCreated(res.data)
  }

  const openOnGithub = (): void => {
    if (!webUrl || !base || !headBranch) return
    // Azure DevOps' form can't be prefilled with a title and description.
    onOpenUrl(
      isAzureWebUrl(webUrl)
        ? newPullRequestWebUrl(webUrl, base, headBranch)
        : withPullRequestText(newPullRequestWebUrl(webUrl, base, headBranch), { title, body })
    )
    onClose()
  }

  const busy = step !== null
  const submitLabel =
    step === 'pushing'
      ? 'Pushing…'
      : step === 'creating'
        ? 'Creating…'
        : `${willPush ? 'Push and create' : 'Create'} ${draft ? 'draft pull request' : 'pull request'}`

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal create-pr-modal"
        role="dialog"
        aria-label="Create pull request"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}
      >
        <div className="modal-header">
          <span>Create pull request</span>
          <button className="icon-button" onClick={onClose} title="Close" disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="create-pr-branches">
            <div className="create-pr-branch">
              <label className="modal-label" htmlFor={`${ids}-head`}>
                Merge
              </label>
              <Select
                id={`${ids}-head`}
                value={headRef}
                options={heads.map((h) => ({ value: h.ref, label: h.ref, title: headStateText(h) ?? undefined }))}
                onChange={setHeadRef}
                disabled={busy}
              />
            </div>
            <span className="create-pr-arrow" aria-hidden>
              →
            </span>
            <div className="create-pr-branch">
              <label className="modal-label" htmlFor={`${ids}-base`}>
                Into
              </label>
              <Select
                id={`${ids}-base`}
                value={base ?? ''}
                options={bases.map((b) => ({ value: b, label: `${remote}/${b}` }))}
                onChange={setBase}
                disabled={busy || bases.length === 0}
              />
            </div>
          </div>
          {stateText && (
            <div className="create-pr-push" data-testid="create-pr-push">
              <span>{stateText}</span>
              <label>
                <input
                  type="checkbox"
                  checked={willPush}
                  disabled={mustPush || busy}
                  onChange={(e) => setPushFirst(e.target.checked)}
                />
                Push {head!.ref} to {remote} first
              </label>
            </div>
          )}
          <label className="modal-label" htmlFor={`${ids}-title`}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            autoFocus
            value={title}
            disabled={busy}
            placeholder={prefilled ? '' : 'Filling in from the commits…'}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <label className="modal-label" htmlFor={`${ids}-body`}>
            Description
          </label>
          <textarea
            id={`${ids}-body`}
            className="create-pr-body"
            value={body}
            disabled={busy}
            rows={9}
            onChange={(e) => setBody(e.target.value)}
          />
          <label className="modal-label" htmlFor={`${ids}-reviewers`}>
            Reviewers
          </label>
          <input
            id={`${ids}-reviewers`}
            ref={reviewersInput}
            value={reviewersText}
            disabled={busy}
            placeholder={
              isAzureWebUrl(webUrl)
                ? 'Email addresses, separated by commas (optional)'
                : 'GitHub usernames, separated by commas (optional)'
            }
            onChange={(e) => setReviewersText(e.target.value)}
          />
          {shownSuggestions.length > 0 && (
            <div className="create-pr-suggestions" role="group" aria-label="Suggested reviewers">
              {shownSuggestions.map((login) => (
                <button key={login} type="button" className="subtle" disabled={busy} onClick={() => addReviewer(login)}>
                  + {login}
                </button>
              ))}
            </div>
          )}
          <label className="create-pr-draft">
            <input type="checkbox" checked={draft} disabled={busy} onChange={(e) => setDraft(e.target.checked)} />
            Create as a draft
          </label>
          {error && (
            <div className="modal-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {webUrl && (
            <button className="subtle create-pr-web" disabled={busy || !base || !headBranch} onClick={openOnGithub}>
              Open on {pullRequestHostLabel(webUrl)} instead
            </button>
          )}
          <button className="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="commit-button"
            disabled={busy || !!problem}
            title={problem ?? undefined}
            onClick={() => void create()}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
