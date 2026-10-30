import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  groupedSections,
  knownRepos,
  moveRepoToGroup,
  type RepoGroup,
  type RepoOverviewEntry
} from '../../../shared/repoOverview'
import { repoDisplayName } from '../lib/repoName'
import Select from './Select'
import { BackIcon, RefreshIcon } from './topBar/icons'

interface Props {
  /** Repos open as tabs. */
  openRepos: string[]
  /** The repo showing in the active tab. */
  activeRepo: string | null
  onClose: () => void
  /** Opens (or switches to) a repo's tab. */
  onOpenRepo: (path: string) => void
}

// Fetches at once during Fetch all; more just queue on the network.
const PARALLEL_FETCHES = 4

/** A plural-aware count, e.g. "1 change", "3 changes". */
const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Every repo SillyGit knows about (open tabs, the Launchpad workspace and the
 * overview's own groups), each with its branch, ahead/behind and uncommitted
 * changes, sorted into the user's groups. Fetch all fetches every one.
 */
export default function RepoOverview({ openRepos, activeRepo, onClose, onOpenRepo }: Props): JSX.Element {
  const [workspace, setWorkspace] = useState<string[] | null>(null)
  const [groups, setGroups] = useState<RepoGroup[] | null>(null)
  const [entries, setEntries] = useState<Map<string, RepoOverviewEntry>>(new Map())
  // The request the last answer was for; loading until it's the current one.
  const [answered, setAnswered] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [fetching, setFetching] = useState<Set<string>>(new Set())
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    void Promise.all([window.api.getWorkspaceRepos(), window.api.getRepoGroups()]).then(([repos, saved]) => {
      setWorkspace(repos)
      setGroups(saved)
    })
  }, [])

  const repos = useMemo(
    () => (workspace && groups ? knownRepos(openRepos, workspace, groups) : null),
    [openRepos, workspace, groups]
  )
  const request = repos ? `${reloads}\0${repos.join('\0')}` : null
  const loading = answered !== request

  useEffect(() => {
    if (!repos || request === null) return
    let cancelled = false
    window.api.repoOverview(repos).then((rows) => {
      if (cancelled) return
      setEntries(new Map(rows.map((row) => [row.path, row])))
      setAnswered(request)
    })
    return () => {
      cancelled = true
    }
  }, [repos, request])

  const reload = (): void => setReloads((n) => n + 1)

  const saveGroups = async (next: RepoGroup[]): Promise<void> => {
    setGroups(next)
    const res = await window.api.setRepoGroups(next)
    if (res.ok) {
      setGroups(res.data)
      setError(null)
    } else setError(res.error)
  }

  const fetchRepos = async (paths: string[]): Promise<void> => {
    setFetching((current) => new Set([...current, ...paths]))
    setFetchErrors((current) => Object.fromEntries(Object.entries(current).filter(([p]) => !paths.includes(p))))
    const queue = [...paths]
    const worker = async (): Promise<void> => {
      for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
        const res = await window.api.fetch(path)
        const done = path
        if (!res.ok) setFetchErrors((current) => ({ ...current, [done]: res.error }))
        setFetching((current) => {
          const next = new Set(current)
          next.delete(done)
          return next
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL_FETCHES, paths.length) }, worker))
    reload()
  }

  const fetchAll = (): void => {
    const readable = (repos ?? []).filter((path) => entries.get(path)?.ok && !fetching.has(path))
    if (readable.length > 0) void fetchRepos(readable)
  }

  const addRepo = async (): Promise<void> => {
    const picked = await window.api.openRepoDialog()
    if (!picked) return
    const res = await window.api.addWorkspaceRepo(picked)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setWorkspace(res.data)
  }

  const removeRepo = async (path: string): Promise<void> => {
    if (groups?.some((g) => g.repos.includes(path))) await saveGroups(moveRepoToGroup(groups, path, null))
    if (workspace?.includes(path)) {
      const res = await window.api.removeWorkspaceRepo(path)
      if (res.ok) setWorkspace(res.data)
    }
  }

  const createGroup = (): void => {
    const name = newGroupName?.trim()
    setNewGroupName(null)
    if (!name || !groups) return
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      setError(`There's already a group called "${name}".`)
      return
    }
    void saveGroups([...groups, { name, repos: [] }])
  }

  const renameGroup = (): void => {
    if (!renaming || !groups) return
    const to = renaming.to.trim()
    setRenaming(null)
    if (!to || to === renaming.from) return
    if (groups.some((g) => g.name !== renaming.from && g.name.toLowerCase() === to.toLowerCase())) {
      setError(`There's already a group called "${to}".`)
      return
    }
    void saveGroups(groups.map((g) => (g.name === renaming.from ? { ...g, name: to } : g)))
  }

  const deleteGroup = (name: string): void => {
    if (groups) void saveGroups(groups.filter((g) => g.name !== name))
  }

  const moveGroup = (name: string, by: -1 | 1): void => {
    if (!groups) return
    const i = groups.findIndex((g) => g.name === name)
    const j = i + by
    if (i < 0 || j < 0 || j >= groups.length) return
    const next = [...groups]
    ;[next[i], next[j]] = [next[j], next[i]]
    void saveGroups(next)
  }

  const sections = repos && groups ? groupedSections(repos, groups) : []
  const groupOptions = [
    { value: '', label: 'No group' },
    ...(groups ?? []).map((g) => ({ value: g.name, label: g.name }))
  ]

  const renderGroupActions = (name: string, paths: string[], index: number): JSX.Element => (
    <span className="repo-overview-group-actions">
      <button
        className="subtle"
        onClick={() => void fetchRepos(paths.filter((p) => entries.get(p)?.ok && !fetching.has(p)))}
        disabled={paths.length === 0}
        title={`Fetch every repository in ${name}`}
      >
        Fetch group
      </button>
      <button className="subtle" onClick={() => moveGroup(name, -1)} disabled={index === 0} aria-label={`Move ${name} up`}>
        ↑
      </button>
      <button
        className="subtle"
        onClick={() => moveGroup(name, 1)}
        disabled={index === (groups?.length ?? 0) - 1}
        aria-label={`Move ${name} down`}
      >
        ↓
      </button>
      <button className="subtle" onClick={() => setRenaming({ from: name, to: name })}>
        Rename
      </button>
      <button className="subtle" onClick={() => deleteGroup(name)} title="Delete the group; its repositories stay listed">
        Delete
      </button>
    </span>
  )

  const renderStatus = (entry: RepoOverviewEntry | undefined): JSX.Element => {
    if (!entry) return <span className="repo-overview-dim">{loading ? 'Loading…' : ''}</span>
    if (!entry.ok)
      return (
        <span className="repo-overview-error" title={entry.error}>
          Can't read this repository
        </span>
      )
    const s = entry.summary
    return (
      <>
        <span className="repo-overview-branch" title={s.upstream ? `Tracking ${s.upstream}` : 'No upstream branch'}>
          {s.branch ?? (s.head ? `detached at ${s.head}` : 'no commits yet')}
        </span>
        {s.upstream ? (
          <>
            {s.ahead > 0 && (
              <span className="repo-overview-badge repo-overview-ahead" title={`${count(s.ahead, 'commit')} to push`}>
                ↑{s.ahead}
              </span>
            )}
            {s.behind > 0 && (
              <span className="repo-overview-badge repo-overview-behind" title={`${count(s.behind, 'commit')} to pull`}>
                ↓{s.behind}
              </span>
            )}
            {s.ahead === 0 && s.behind === 0 && <span className="repo-overview-dim">up to date</span>}
          </>
        ) : (
          s.branch && <span className="repo-overview-dim">not published</span>
        )}
        {s.conflicts > 0 && (
          <span className="repo-overview-badge repo-overview-conflicts">{count(s.conflicts, 'conflict')}</span>
        )}
        {s.changes > 0 ? (
          <span className="repo-overview-badge repo-overview-changes">{count(s.changes, 'change')}</span>
        ) : (
          <span className="repo-overview-dim">clean</span>
        )}
      </>
    )
  }

  const renderRow = (path: string, group: string | null): JSX.Element => {
    const entry = entries.get(path)
    const isOpen = openRepos.includes(path)
    const removable = !isOpen && (workspace?.includes(path) || group !== null)
    return (
      <div
        key={path}
        className={`repo-overview-row ${path === activeRepo ? 'repo-overview-row-active' : ''}`}
        data-testid="repo-overview-row"
      >
        <button className="repo-overview-name" onClick={() => onOpenRepo(path)} title={`Open ${path}`}>
          <span className="repo-overview-repo">{repoDisplayName(path)}</span>
          {isOpen && <span className="repo-overview-tag">open</span>}
          <span className="repo-overview-path">{path}</span>
        </button>
        <div className="repo-overview-status">
          {renderStatus(entry)}
          {fetchErrors[path] && (
            <span className="repo-overview-error" title={fetchErrors[path]}>
              Fetch failed
            </span>
          )}
        </div>
        <div className="repo-overview-actions">
          <Select
            value={group ?? ''}
            options={groupOptions}
            onChange={(name) => groups && void saveGroups(moveRepoToGroup(groups, path, name || null))}
            aria-label={`Group for ${repoDisplayName(path)}`}
            className="repo-overview-group-select"
            variant="ghost"
          />
          <button
            className="subtle"
            disabled={!entry?.ok || fetching.has(path)}
            onClick={() => void fetchRepos([path])}
            title={`Fetch ${repoDisplayName(path)}`}
          >
            {fetching.has(path) ? 'Fetching…' : 'Fetch'}
          </button>
          {removable && (
            <button
              className="subtle repo-overview-remove"
              onClick={() => void removeRepo(path)}
              title="Remove from the overview and Launchpad"
              aria-label={`Remove ${repoDisplayName(path)}`}
            >
              ×
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="repo-overview launchpad" data-testid="repo-overview">
      <div className="launchpad-header">
        <button className="icon-button" onClick={onClose} title="Back">
          <BackIcon />
        </button>
        <div className="launchpad-title">
          <span>Repositories</span>
          {repos && <span className="launchpad-subtitle">{repos.length === 1 ? '1 repository' : `${repos.length} repositories`}</span>}
        </div>
        <button className="subtle" onClick={() => void addRepo()}>
          + Add repo
        </button>
        <button className="subtle" onClick={() => setNewGroupName('')} disabled={newGroupName !== null || !groups}>
          + New group
        </button>
        <button onClick={fetchAll} disabled={!repos || repos.length === 0 || fetching.size > 0}>
          {fetching.size > 0 ? `Fetching ${fetching.size}…` : 'Fetch all'}
        </button>
        <button className="icon-button" onClick={reload} disabled={loading} title="Refresh">
          <RefreshIcon />
        </button>
      </div>
      <div className="launchpad-body repo-overview-body">
        {error && (
          <div className="repo-overview-notice repo-overview-error" role="alert">
            {error}
          </div>
        )}
        {newGroupName !== null && (
          <form
            className="repo-overview-new-group"
            onSubmit={(e) => {
              e.preventDefault()
              createGroup()
            }}
          >
            <input
              autoFocus
              value={newGroupName}
              placeholder="Group name, e.g. Work"
              aria-label="New group name"
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNewGroupName(null)}
            />
            <button type="submit">Add group</button>
            <button type="button" className="subtle" onClick={() => setNewGroupName(null)}>
              Cancel
            </button>
          </form>
        )}
        {repos && repos.length === 0 && (
          <div className="launchpad-notice">
            No repositories yet. Open one in a tab, or click <strong>+ Add repo</strong> to list it here without opening it.
          </div>
        )}
        {sections.map((section, i) => (
          <section key={section.name ?? '\0ungrouped'} className="repo-overview-group" aria-label={section.name ?? 'Not in a group'}>
            {(section.name !== null || (groups?.length ?? 0) > 0) && (
              <div className="launchpad-bucket-header repo-overview-group-header">
                {renaming && renaming.from === section.name ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      renameGroup()
                    }}
                  >
                    <input
                      autoFocus
                      value={renaming.to}
                      aria-label="Group name"
                      onChange={(e) => setRenaming({ ...renaming, to: e.target.value })}
                      onBlur={renameGroup}
                      onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    />
                  </form>
                ) : (
                  <span className="launchpad-bucket-label">{section.name ?? 'Not in a group'}</span>
                )}
                <span className="launchpad-bucket-count">{section.repos.length}</span>
                {section.name !== null && renderGroupActions(section.name, section.repos, i)}
              </div>
            )}
            {section.repos.length === 0 ? (
              <div className="repo-overview-empty">Pick this group from a repository's group menu to add it here.</div>
            ) : (
              section.repos.map((path) => renderRow(path, section.name))
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
