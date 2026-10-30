import type { JSX } from 'react'
import { repoDisplayName } from '../lib/repoName'
import logo from '../assets/logo.png'

/** What shows with no repository open: the logo, Open and Clone Repository, and the recent ones. */
export default function EmptyState({
  recentRepos,
  onOpenRepo,
  onClone,
  onOpenRecentRepo
}: {
  recentRepos: string[]
  onOpenRepo: () => void
  onClone: () => void
  onOpenRecentRepo: (path: string) => void
}): JSX.Element {
  return (
    <div className="empty-state">
      <img className="empty-state-logo" src={logo} alt="SillyGit" />
      <p>No repository open.</p>
      <div className="empty-state-actions">
        <button onClick={onOpenRepo}>Open Repository</button>
        <button className="subtle" onClick={onClone}>
          Clone Repository
        </button>
      </div>
      {recentRepos.length > 0 && (
        <section className="recent-repos" aria-label="Recent repositories">
          <span className="recent-repos-label">Recent</span>
          {recentRepos.map((path) => (
            <button key={path} className="recent-repo" title={path} onClick={() => onOpenRecentRepo(path)}>
              <span className="recent-repo-name">{repoDisplayName(path)}</span>
              <span className="recent-repo-path">{path}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
