import { useEffect, useState, type JSX } from 'react'
import type { CommitDetail } from '../../../../shared/types'
import ContextMenu from '../ContextMenu'
import Avatar from '../Avatar'
import AiResults, { idleAiRun, type AiRun } from '../AiResults'
import SplitCommitPanel from '../SplitCommitPanel'
import { fileMenuSections } from '../fileMenu'
import { useCustomCommandMenu } from '../../lib/customCommandMenu'
import { onFileListKeyDown } from '../../lib/fileListNav'
import type { OpenFileView } from './types'

function SparkleIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2.5 9.2 6.8 13.5 8 9.2 9.2 8 13.5 6.8 9.2 2.5 8 6.8 6.8 8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  repoPath: string
  hash: string
  headHash: string | null
  activePath: string | null
  /** Opens one of the commit's files full window, scrolled to `line` when given. */
  onOpenFileDiff: (hash: string, path: string, line?: number) => void
  onOpenFileView: OpenFileView
  onCopyText: (text: string) => void
  /** AI split the checked-out commit. */
  onSplitApplied: () => void
}

/**
 * The side bar for one commit: its message, author and changed files, then AI
 * review and splitting. It stays the same beside the graph and beside a
 * file's full-window diff, so the file list doesn't move when one is opened.
 * Moving to another commit keeps the last one up until the next has loaded,
 * so stepping through the graph doesn't blink the panel to "Loading…".
 */
export default function CommitDetailView({ repoPath, hash, ...rest }: Props): JSX.Element {
  // The last commit loaded (or that failed to load), and the repo it's from.
  const [loaded, setLoaded] = useState<{
    repoPath: string
    hash: string
    detail: CommitDetail | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.commitDetail(repoPath, hash).then((res) => {
      if (cancelled) return
      setLoaded({ repoPath, hash, detail: res.ok ? res.data : null, error: res.ok ? null : res.error })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  const shown = loaded?.repoPath === repoPath ? loaded : null
  if (!shown) return <div className="detail-panel-content">Loading…</div>
  if (!shown.detail) return <div className="detail-panel-content">{shown.error}</div>
  return (
    <CommitDetailBody
      // A fresh body (AI results, menus) for each commit.
      key={shown.hash}
      repoPath={repoPath}
      detail={shown.detail}
      stale={shown.hash !== hash}
      {...rest}
    />
  )
}

function CommitDetailBody({
  repoPath,
  detail,
  stale,
  headHash,
  activePath,
  onOpenFileDiff,
  onOpenFileView,
  onCopyText,
  onSplitApplied
}: Omit<Props, 'hash'> & {
  detail: CommitDetail
  /** Another commit is selected and still loading; this one stays up meanwhile but can't be used. */
  stale: boolean
}): JSX.Element {
  const { hash } = detail
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; path: string; status: string } | null>(null)
  const customMenu = useCustomCommandMenu()
  const [commitAi, setCommitAi] = useState<AiRun>(idleAiRun)
  const [fileAiPath, setFileAiPath] = useState<string | null>(null)
  const [fileAi, setFileAi] = useState<AiRun>(idleAiRun)
  const openFile = (path: string, line?: number): void => onOpenFileDiff(hash, path, line)

  const runCommitAi = async (): Promise<void> => {
    setCommitAi({ state: 'loading', result: null, error: null })
    const res = await window.api.aiReviewCommit(repoPath, hash)
    setCommitAi(res.ok ? { state: 'done', result: res.data, error: null } : { state: 'error', result: null, error: res.error })
  }

  const runFileAi = async (path: string): Promise<void> => {
    setFileAiPath(path)
    setFileAi({ state: 'loading', result: null, error: null })
    const res = await window.api.aiReviewFile(repoPath, hash, path)
    setFileAi(res.ok ? { state: 'done', result: res.data, error: null } : { state: 'error', result: null, error: res.error })
  }

  const modified = detail.files.filter((f) => f.status === 'M').length
  const added = detail.files.filter((f) => f.status === 'A').length
  const deleted = detail.files.filter((f) => f.status === 'D').length

  return (
    <div className="detail-panel-content" aria-busy={stale} inert={stale}>
      <div className="detail-header-row">
        <span>commit: {detail.hash.slice(0, 7)}</span>
      </div>
      <div className="commit-subject-large" data-testid="commit-subject">
        {detail.subject}
      </div>
      {detail.body && <div className="commit-body">{detail.body}</div>}
      <div className="commit-author-row">
        <Avatar name={detail.author} email={detail.authorEmail} hash={detail.hash} repoPath={repoPath} size={28} />
        <div>
          <div>{detail.author}</div>
          <div className="commit-meta-dim">
            {new Date(detail.date).toLocaleString()}
            {detail.parents[0] && ` · parent: ${detail.parents[0].slice(0, 7)}`}
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          <span>
            {modified > 0 && `${modified} modified`}
            {added > 0 && `${modified > 0 ? ', ' : ''}${added} added`}
            {deleted > 0 && `${modified + added > 0 ? ', ' : ''}${deleted} deleted`}
            {detail.files.length === 0 && 'No file changes'}
          </span>
        </div>
        <ul className="file-list commit-file-list" onKeyDown={onFileListKeyDown}>
          {detail.files.map((f) => (
            <li key={f.path}>
              <div
                className={`file-row ${activePath === f.path ? 'active' : ''}`}
                aria-current={activePath === f.path}
                tabIndex={-1}
                onClick={() => openFile(f.path)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setFileMenu({ x: e.clientX, y: e.clientY, path: f.path, status: f.status[0] })
                }}
              >
                <span className={`status-code code-${f.status[0]}`}>{f.status[0]}</span>
                <span className="file-path">{f.path}</span>
                <span className="file-actions">
                  <button
                    className="icon-button"
                    title="Ask AI about this file"
                    aria-label={`Ask AI about ${f.path}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void runFileAi(f.path)
                    }}
                  >
                    <SparkleIcon />
                  </button>
                </span>
              </div>
              {fileAiPath === f.path && (
                <div className="ai-inline">
                  <AiResults run={fileAi} onSelectFinding={openFile} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="ai-section">
        <button className="ai-ask-button" disabled={commitAi.state === 'loading'} onClick={() => void runCommitAi()}>
          {commitAi.state === 'loading' ? 'Reviewing commit…' : 'Ask AI to review commit'}
        </button>
        <AiResults run={commitAi} onSelectFinding={openFile} />
      </div>
      {hash === headHash && <SplitCommitPanel repoPath={repoPath} hash={hash} onApplied={onSplitApplied} />}
      {fileMenu && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          sections={fileMenuSections({
            path: fileMenu.path,
            deleted: fileMenu.status === 'D',
            onOpenDiff: () => openFile(fileMenu.path),
            onBlame: () => onOpenFileView(fileMenu.path, hash, 'blame'),
            onHistory: () => onOpenFileView(fileMenu.path, hash, 'history'),
            onCopyPath: () => onCopyText(fileMenu.path),
            custom: customMenu('file', { file: fileMenu.path, sha: hash })
          })}
          onClose={() => setFileMenu(null)}
        />
      )}
    </div>
  )
}
