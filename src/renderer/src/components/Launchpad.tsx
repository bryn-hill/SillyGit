import { useEffect, useMemo, useState, type JSX } from 'react'
import type { LaunchpadBucketId, LaunchpadData, LaunchpadPullRequest } from '../../../shared/types'
import { LAUNCHPAD_BUCKET_COLOR_VAR, LAUNCHPAD_BUCKET_LABELS, LAUNCHPAD_BUCKET_ORDER } from '../../../shared/launchpad'
import { timeAgo } from '../lib/timeAgo'
import PullRequestReview from './PullRequestReview'

/** A pull request to open in the review screen. */
export interface PullRequestRef {
  repoPath: string
  number: number
  title: string
}

interface Props {
  /** A pull request to show straight away instead of the list, e.g. one just created. */
  initialReview?: PullRequestRef | null
  /** The active repo tab, if any. */
  repoPath: string | null
  /** Every repo open in a tab; their pull requests show alongside the workspace's. */
  openRepos?: string[]
  onClose: () => void
  onOpenTerminal: () => void
  /** Checks the pull request out as a local branch; resolves when that's done or has failed. */
  onCheckout: (repoPath: string, number: number) => Promise<void>
}

const NO_REPOS: string[] = []

function repoDisplayName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function RefreshIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 4.5A5.5 5.5 0 0 0 3.6 5.6M3 2.5v3.3h3.3M3 11.5A5.5 5.5 0 0 0 12.4 10.4M13 13.5v-3.3h-3.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BackIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function groupByBucket(
  prs: LaunchpadPullRequest[]
): { bucket: LaunchpadBucketId; items: LaunchpadPullRequest[] }[] {
  return LAUNCHPAD_BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: prs.filter((pr) => pr.bucket === bucket)
  })).filter((g) => g.items.length > 0)
}

function UnavailableNotice({
  data,
  onOpenTerminal
}: {
  data: LaunchpadData
  onOpenTerminal: () => void
}): JSX.Element {
  if (data.reason === 'gh-not-installed') {
    return (
      <div className="launchpad-notice">
        <p>Launchpad needs a GitHub account to find your pull requests.</p>
        <p className="launchpad-notice-hint">
          Add a personal access token under Settings → Accounts, or install the GitHub CLI from{' '}
          <span className="launchpad-code">cli.github.com</span>, then click Refresh.
        </p>
      </div>
    )
  }
  if (data.reason === 'not-authenticated') {
    return (
      <div className="launchpad-notice">
        <p>Not signed in to GitHub.</p>
        <p className="launchpad-notice-hint">
          Add a personal access token under Settings → Accounts, or run{' '}
          <span className="launchpad-code">gh auth login</span> in a terminal, then click Refresh.
        </p>
        <button onClick={onOpenTerminal}>Open Terminal</button>
      </div>
    )
  }
  if (data.reason === 'not-github') {
    return (
      <div className="launchpad-notice">
        <p>This repository's remote isn't on GitHub.</p>
        <p className="launchpad-notice-hint">Launchpad currently supports GitHub repositories only.</p>
      </div>
    )
  }
  return (
    <div className="launchpad-notice">
      <p>Couldn't load pull requests.</p>
      {data.message && <p className="launchpad-notice-hint">{data.message}</p>}
    </div>
  )
}

export default function Launchpad({
  initialReview = null,
  repoPath,
  openRepos = NO_REPOS,
  onClose,
  onOpenTerminal,
  onCheckout
}: Props): JSX.Element {
  const [data, setData] = useState<LaunchpadData | null>(null)
  // The request the last answer was for, and its error; loading until it's the current one.
  const [answered, setAnswered] = useState<{ request: string; error: string | null } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [actionError, setError] = useState<string | null>(null)
  const [mergingNumber, setMergingNumber] = useState<number | null>(null)
  // The card whose Check out is running (repoPath#number).
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const [workspaceRepos, setWorkspaceRepos] = useState<string[]>([])
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [addingRepo, setAddingRepo] = useState(false)
  const [reviewing, setReviewing] = useState<PullRequestRef | null>(initialReview)

  useEffect(() => {
    window.api.getWorkspaceRepos().then((repos) => {
      setWorkspaceRepos(repos)
      setWorkspaceLoaded(true)
    })
  }, [])

  const allRepoPaths = useMemo(
    () => [...new Set([...(repoPath ? [repoPath] : []), ...openRepos, ...workspaceRepos])],
    [repoPath, openRepos, workspaceRepos]
  )

  const request = `${reloads}\0${allRepoPaths.join('\0')}`
  const loading = answered?.request !== request
  const error = actionError ?? (loading ? null : answered.error)

  const load = (): void => {
    setError(null)
    setReloads((n) => n + 1)
  }

  useEffect(() => {
    if (!workspaceLoaded) return
    let cancelled = false
    window.api.launchpadGetData(allRepoPaths).then((res) => {
      if (cancelled) return
      if (res.ok) setData(res.data)
      setAnswered({ request, error: res.ok ? null : res.error })
    })
    return () => {
      cancelled = true
    }
  }, [workspaceLoaded, allRepoPaths, request])

  const handleMerge = (pr: LaunchpadPullRequest): void => {
    const ok = window.confirm(`Merge #${pr.number} "${pr.title}" into ${pr.baseRefName}?`)
    if (!ok) return
    setMergingNumber(pr.number)
    window.api.launchpadMergePr(pr.repoPath, pr.number).then((res) => {
      setMergingNumber(null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      load()
    })
  }

  const handleCheckout = async (pr: LaunchpadPullRequest): Promise<void> => {
    setCheckingOut(`${pr.repoPath}#${pr.number}`)
    await onCheckout(pr.repoPath, pr.number)
    setCheckingOut(null)
  }

  const handleAddRepo = async (): Promise<void> => {
    const picked = await window.api.openRepoDialog()
    if (!picked) return
    setAddingRepo(true)
    const res = await window.api.addWorkspaceRepo(picked)
    setAddingRepo(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setWorkspaceRepos(res.data)
  }

  const handleRemoveRepo = async (path: string): Promise<void> => {
    const res = await window.api.removeWorkspaceRepo(path)
    if (res.ok) setWorkspaceRepos(res.data)
  }

  const groups = data?.connected ? groupByBucket(data.pullRequests) : []

  if (reviewing)
    return (
      <PullRequestReview
        key={`${reviewing.repoPath}#${reviewing.number}`}
        repoPath={reviewing.repoPath}
        number={reviewing.number}
        title={reviewing.title}
        onCheckout={() => onCheckout(reviewing.repoPath, reviewing.number)}
        onBack={() => {
          setReviewing(null)
          load()
        }}
      />
    )

  return (
    <div className="launchpad" data-testid="launchpad">
      <div className="launchpad-header">
        <button className="icon-button" onClick={onClose} title="Back">
          <BackIcon />
        </button>
        <div className="launchpad-title">
          <span>Launchpad</span>
          {data?.connected && data.login && <span className="launchpad-subtitle">signed in as {data.login}</span>}
        </div>
        <button className="icon-button" onClick={load} disabled={loading} title="Refresh">
          <RefreshIcon />
        </button>
      </div>
      <div className="launchpad-workspace">
        <span className="launchpad-workspace-label">Workspace</span>
        {repoPath && (
          <span className="launchpad-chip launchpad-chip-current" title={repoPath}>
            {repoDisplayName(repoPath)}
          </span>
        )}
        {workspaceRepos.map((path) => (
          <span key={path} className="launchpad-chip" title={path}>
            {repoDisplayName(path)}
            <button
              className="launchpad-chip-remove"
              onClick={() => handleRemoveRepo(path)}
              title="Remove from workspace"
            >
              ×
            </button>
          </span>
        ))}
        <button className="subtle launchpad-add-repo" onClick={handleAddRepo} disabled={addingRepo}>
          {addingRepo ? 'Adding…' : '+ Add repo'}
        </button>
      </div>
      <div className="launchpad-body">
        {loading && !data && <div className="launchpad-notice">Loading…</div>}
        {error && (
          <div className="launchpad-notice">
            <p>Couldn't load pull requests.</p>
            <p className="launchpad-notice-hint">{error}</p>
          </div>
        )}
        {!error && data && !data.connected && <UnavailableNotice data={data} onOpenTerminal={onOpenTerminal} />}
        {!error && data?.connected && groups.length === 0 && (
          <div className="launchpad-notice">You're all caught up — no open pull requests need your attention.</div>
        )}
        {!error &&
          data?.connected &&
          groups.map(({ bucket, items }) => (
            <div key={bucket} className="launchpad-bucket">
              <div className="launchpad-bucket-header">
                <span
                  className="launchpad-bucket-dot"
                  style={{ background: `var(${LAUNCHPAD_BUCKET_COLOR_VAR[bucket]})` }}
                />
                <span className="launchpad-bucket-label">{LAUNCHPAD_BUCKET_LABELS[bucket]}</span>
                <span className="launchpad-bucket-count">{items.length}</span>
              </div>
              <div className="launchpad-cards">
                {items.map((pr) => (
                  <div key={`${pr.repoPath}#${pr.number}`} className="launchpad-card" data-testid="launchpad-card">
                    <div
                      className="launchpad-card-main launchpad-card-clickable"
                      onClick={() => setReviewing(pr)}
                      title="Open this pull request"
                    >
                      <div className="launchpad-card-title">{pr.title}</div>
                      <div className="launchpad-card-meta">
                        {pr.repoName} · #{pr.number} · {pr.headRefName} → {pr.baseRefName} · {pr.author} ·{' '}
                        {timeAgo(pr.updatedAt)}
                      </div>
                    </div>
                    <div className="launchpad-card-stats">
                      <span className="launchpad-stat-add">+{pr.additions}</span>
                      <span className="launchpad-stat-del">-{pr.deletions}</span>
                    </div>
                    <div className="launchpad-card-actions">
                      {bucket === 'readyToMerge' && pr.isMine && (
                        <button disabled={mergingNumber === pr.number} onClick={() => handleMerge(pr)}>
                          {mergingNumber === pr.number ? 'Merging…' : 'Merge'}
                        </button>
                      )}
                      <button onClick={() => setReviewing(pr)}>{pr.isMine ? 'View' : 'Review'}</button>
                      <button
                        className="subtle"
                        disabled={checkingOut !== null}
                        onClick={() => void handleCheckout(pr)}
                        title={`Check out ${pr.headRefName} as a local branch`}
                        aria-label={`Check out #${pr.number}`}
                      >
                        {checkingOut === `${pr.repoPath}#${pr.number}` ? 'Checking out…' : 'Check out'}
                      </button>
                      <button className="subtle" onClick={() => window.api.openExternal(pr.url)} title="Open on GitHub">
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {!error && data?.connected && data.skippedRepos && data.skippedRepos.length > 0 && (
          <div
            className="launchpad-skipped"
            title={data.skippedRepos.map((s) => `${s.repoName}: ${s.message ?? s.reason}`).join('\n')}
          >
            {data.skippedRepos.length} workspace repo{data.skippedRepos.length > 1 ? 's' : ''} skipped
          </div>
        )}
      </div>
    </div>
  )
}
