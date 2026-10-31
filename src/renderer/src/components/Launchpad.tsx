import { useEffect, useMemo, useState, type JSX } from 'react'
import { useCached } from '../hooks/useCached'
import { cacheKey, writeCached } from '../lib/swrCache'
import type { LaunchpadBucketId, LaunchpadData, LaunchpadIssue, LaunchpadPullRequest } from '../../../shared/types'
import { LAUNCHPAD_BUCKET_COLOR_VAR, LAUNCHPAD_BUCKET_LABELS, LAUNCHPAD_BUCKET_ORDER } from '../../../shared/launchpad'
import { timeAgo } from '../lib/timeAgo'
import PullRequestReview from './PullRequestReview'
import { BackIcon, RefreshIcon } from './topBar/icons'
import StartWorkDialog, { type WorkItem } from './StartWorkDialog'
import MergePullRequestDialog from './MergePullRequestDialog'
import { issueBranchName } from '../../../shared/issues'
import { jiraBranchName, type JiraIssue, type JiraIssues } from '../../../shared/jira'

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
  /** Start work checked out a branch in `repoPath`; `message` says which. */
  onStartedWork: (repoPath: string, message: string) => void
}

const NO_REPOS: string[] = []
// Launchpad spans every repo, so its answers are cached once for the window.
const LAUNCHPAD_KEY = cacheKey('launchpad', '')
const JIRA_KEY = cacheKey('launchpad-jira', '')
const WORKSPACE_KEY = cacheKey('workspace-repos', '')

function repoDisplayName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
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
        <p>This repository's remote isn't on GitHub or Azure DevOps.</p>
        <p className="launchpad-notice-hint">Launchpad supports GitHub and Azure DevOps repositories.</p>
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

function IssueCard({ issue, onStartWork }: { issue: LaunchpadIssue; onStartWork: () => void }): JSX.Element {
  return (
    <div className="launchpad-card" data-testid="launchpad-issue">
      <div className="launchpad-card-main">
        <div className="launchpad-card-title">{issue.title}</div>
        <div className="launchpad-card-meta">
          {issue.repoName} · #{issue.number} · {issue.author} · {timeAgo(issue.updatedAt)}
        </div>
      </div>
      {issue.labels.length > 0 && (
        <div className="launchpad-issue-labels">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.name}
              className={label.color ? 'launchpad-issue-label' : 'launchpad-issue-label plain'}
              style={label.color ? { borderColor: `#${label.color}`, background: `#${label.color}26` } : undefined}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <div className="launchpad-card-actions">
        <button onClick={onStartWork}>Start work</button>
        <button
          className="subtle"
          onClick={() => window.api.openExternal(issue.url)}
          title={issue.provider === 'azure' ? 'Open on Azure DevOps' : 'Open on GitHub'}
        >
          Open
        </button>
      </div>
    </div>
  )
}

/** Start work on a GitHub issue or Azure Boards work item, in its own repo. */
function githubWorkItem(issue: LaunchpadIssue): WorkItem {
  return {
    issue: issue.number,
    label: `#${issue.number}`,
    title: issue.title,
    branch: issueBranchName(issue.number, issue.title),
    repoPath: issue.repoPath,
    outcome:
      issue.provider === 'azure'
        ? `Its pull request will be linked to work item #${issue.number}.`
        : `Its pull request will close #${issue.number}.`
  }
}

/** Start work on a Jira issue, in a repo the user picks. */
function jiraWorkItem(issue: JiraIssue): WorkItem {
  return {
    issue: issue.key,
    label: issue.key,
    title: issue.summary,
    branch: jiraBranchName(issue.key, issue.summary),
    repoPath: null,
    outcome: `Its pull request will name ${issue.key}.`
  }
}

const JIRA_STATUS_CLASS: Record<JiraIssue['statusCategory'], string> = {
  new: 'jira-status-new',
  indeterminate: 'jira-status-progress',
  done: 'jira-status-done'
}

function JiraIssueCard({ issue, onStartWork }: { issue: JiraIssue; onStartWork: () => void }): JSX.Element {
  return (
    <div className="launchpad-card" data-testid="launchpad-jira-issue">
      <div className="launchpad-card-main">
        <div className="launchpad-card-title">{issue.summary}</div>
        <div className="launchpad-card-meta">
          {issue.key}
          {issue.type && ` · ${issue.type}`}
          {issue.priority && ` · ${issue.priority}`}
          {issue.updatedAt && ` · ${timeAgo(issue.updatedAt)}`}
        </div>
      </div>
      {issue.status && <span className={`jira-status ${JIRA_STATUS_CLASS[issue.statusCategory]}`}>{issue.status}</span>}
      <div className="launchpad-card-actions">
        <button onClick={onStartWork} aria-label={`Start work on ${issue.key}`}>
          Start work
        </button>
        <button className="subtle" onClick={() => window.api.openExternal(issue.url)} title="Open in Jira">
          Open
        </button>
      </div>
    </div>
  )
}

export default function Launchpad({
  initialReview = null,
  repoPath,
  openRepos = NO_REPOS,
  onClose,
  onOpenTerminal,
  onCheckout,
  onStartedWork
}: Props): JSX.Element {
  // Stale-while-revalidate: the last answers show at once each time Launchpad
  // opens, and are swapped for fresh ones when those land.
  const data = useCached<LaunchpadData | null>(LAUNCHPAD_KEY, null)
  // The request the last answer was for, and its error; loading until it's the current one.
  const [answered, setAnswered] = useState<{ request: string; error: string | null } | null>(null)
  const [reloads, setReloads] = useState(0)
  const [actionError, setError] = useState<string | null>(null)
  // The pull request whose merge dialog is open.
  const [merging, setMerging] = useState<LaunchpadPullRequest | null>(null)
  // The card whose Check out is running (repoPath#number).
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  const savedWorkspaceRepos = useCached<string[] | null>(WORKSPACE_KEY, null)
  const workspaceRepos = savedWorkspaceRepos ?? NO_REPOS
  const workspaceLoaded = savedWorkspaceRepos !== null
  const setWorkspaceRepos = (repos: string[]): void => writeCached(WORKSPACE_KEY, repos)
  const [addingRepo, setAddingRepo] = useState(false)
  const [reviewing, setReviewing] = useState<PullRequestRef | null>(initialReview)
  const [startingWork, setStartingWork] = useState<WorkItem | null>(null)
  const jira = useCached<JiraIssues | null>(JIRA_KEY, null)

  useEffect(() => {
    window.api.getWorkspaceRepos().then((repos) => writeCached(WORKSPACE_KEY, repos))
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
      if (res.ok) writeCached(LAUNCHPAD_KEY, res.data)
      setAnswered({ request, error: res.ok ? null : res.error })
    })
    return () => {
      cancelled = true
    }
  }, [workspaceLoaded, allRepoPaths, request])

  // Jira isn't tied to the repos, and a slow site shouldn't hold up the pull requests.
  useEffect(() => {
    let cancelled = false
    window.api.jiraAssignedIssues().then((res) => {
      if (cancelled) return
      writeCached(
        JIRA_KEY,
        res.ok ? res.data : { connected: true, issues: [], problems: [{ host: 'Jira', message: res.error }] }
      )
    })
    return () => {
      cancelled = true
    }
  }, [reloads])


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
  const issues = data?.connected ? (data.issues ?? []) : []
  const jiraIssues = jira?.issues ?? []

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
        {!error && data?.connected && groups.length === 0 && issues.length === 0 && jiraIssues.length === 0 && (
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
                    {/* Azure DevOps doesn't say how big a pull request is until it's opened. */}
                    <div className="launchpad-card-stats">
                      {pr.provider !== 'azure' && (
                        <>
                          <span className="launchpad-stat-add">+{pr.additions}</span>
                          <span className="launchpad-stat-del">-{pr.deletions}</span>
                        </>
                      )}
                    </div>
                    <div className="launchpad-card-actions">
                      {bucket === 'readyToMerge' && pr.isMine && (
                        <button onClick={() => setMerging(pr)}>Merge…</button>
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
                      <button className="subtle" onClick={() => window.api.openExternal(pr.url)} title={`Open on ${pr.provider === 'azure' ? 'Azure DevOps' : 'GitHub'}`}>
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {!error && issues.length > 0 && (
          <section className="launchpad-bucket" aria-label="Assigned issues">
            <div className="launchpad-bucket-header">
              <span className="launchpad-bucket-dot" style={{ background: 'var(--accent)' }} />
              <span className="launchpad-bucket-label">Assigned issues</span>
              <span className="launchpad-bucket-count">{issues.length}</span>
            </div>
            <div className="launchpad-cards">
              {issues.map((issue) => (
                <IssueCard
                  key={`${issue.repoPath}#${issue.number}`}
                  issue={issue}
                  onStartWork={() => setStartingWork(githubWorkItem(issue))}
                />
              ))}
            </div>
          </section>
        )}
        {jira?.connected && (jiraIssues.length > 0 || jira.problems.length > 0) && (
          <section className="launchpad-bucket" aria-label="Jira issues">
            <div className="launchpad-bucket-header">
              <span className="launchpad-bucket-dot" style={{ background: 'var(--cyan)' }} />
              <span className="launchpad-bucket-label">Jira issues</span>
              <span className="launchpad-bucket-count">{jiraIssues.length}</span>
            </div>
            {jira.problems.map((p) => (
              <div key={p.host} className="launchpad-notice-hint" role="alert">
                Couldn't load issues from {p.host}: {p.message}
              </div>
            ))}
            <div className="launchpad-cards">
              {jiraIssues.map((issue) => (
                <JiraIssueCard
                  key={`${issue.host}/${issue.key}`}
                  issue={issue}
                  onStartWork={() => setStartingWork(jiraWorkItem(issue))}
                />
              ))}
            </div>
          </section>
        )}
        {!error && data?.connected && data.skippedRepos && data.skippedRepos.length > 0 && (
          <div
            className="launchpad-skipped"
            title={data.skippedRepos.map((s) => `${s.repoName}: ${s.message ?? s.reason}`).join('\n')}
          >
            {data.skippedRepos.length} workspace repo{data.skippedRepos.length > 1 ? 's' : ''} skipped
          </div>
        )}
      </div>
      {merging && (
        <MergePullRequestDialog
          key={`${merging.repoPath}#${merging.number}`}
          pr={merging}
          onCancel={() => setMerging(null)}
          onMerged={() => {
            setMerging(null)
            load()
          }}
        />
      )}
      {startingWork && (
        <StartWorkDialog
          key={`${startingWork.repoPath}#${startingWork.issue}`}
          item={startingWork}
          repos={allRepoPaths}
          onCancel={() => setStartingWork(null)}
          onStarted={(path, result) => {
            const item = startingWork
            setStartingWork(null)
            const how = result.created ? (result.stackedOn ? `stacked on ${result.stackedOn}` : 'created') : 'checked out'
            onStartedWork(path, `Working on ${item.label} on ${result.branch} (${how}).`)
          }}
        />
      )}
    </div>
  )
}
