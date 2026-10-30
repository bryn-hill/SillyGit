// The repository overview: every known repo, in the user's groups, with its
// branch, ahead/behind and uncommitted changes at a glance.

/** One repo's state, from `git status --porcelain=v2 --branch`. */
export interface RepoSummary {
  path: string
  /** The checked-out branch, or null when HEAD is detached (or the repo has no commits yet). */
  branch: string | null
  /** The short commit HEAD is on, for a detached HEAD. */
  head: string | null
  /** The upstream branch, e.g. origin/main, or null when there isn't one. */
  upstream: string | null
  ahead: number
  behind: number
  /** Files with staged, unstaged or untracked changes (a file changed both ways counts once). */
  changes: number
  /** Files with conflicts. */
  conflicts: number
}

/** A repo's row: its summary, or why it couldn't be read (moved, deleted, not a repo any more). */
export type RepoOverviewEntry = { path: string; ok: true; summary: RepoSummary } | { path: string; ok: false; error: string }

/** A named group of repos, in the user's order. */
export interface RepoGroup {
  name: string
  repos: string[]
}

/** Reads `git status --porcelain=v2 --branch` output. */
export function parseStatusSummary(path: string, output: string): RepoSummary {
  const summary: RepoSummary = { path, branch: null, head: null, upstream: null, ahead: 0, behind: 0, changes: 0, conflicts: 0 }
  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length).trim()
      summary.head = oid === '(initial)' ? null : oid.slice(0, 7)
    } else if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      summary.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      summary.upstream = line.slice('# branch.upstream '.length).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        summary.ahead = Number(m[1])
        summary.behind = Number(m[2])
      }
    } else if (line.startsWith('u ')) {
      summary.conflicts++
      summary.changes++
    } else if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('? ')) {
      summary.changes++
    }
  }
  return summary
}

/** Cleans up groups read from settings: named, no empty names, each repo in one group only. */
export function normalizeRepoGroups(raw: unknown): RepoGroup[] {
  if (!Array.isArray(raw)) return []
  const seenNames = new Set<string>()
  const seenRepos = new Set<string>()
  const groups: RepoGroup[] = []
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue
    const name = typeof (g as RepoGroup).name === 'string' ? (g as RepoGroup).name.trim() : ''
    if (!name || seenNames.has(name.toLowerCase())) continue
    seenNames.add(name.toLowerCase())
    const repos = Array.isArray((g as RepoGroup).repos)
      ? (g as RepoGroup).repos.filter((r): r is string => typeof r === 'string' && !!r && !seenRepos.has(r))
      : []
    repos.forEach((r) => seenRepos.add(r))
    groups.push({ name, repos })
  }
  return groups
}

/** Every repo the overview knows about, each once: open tabs, then the workspace, then grouped repos. */
export function knownRepos(openTabs: string[], workspace: string[], groups: RepoGroup[]): string[] {
  return [...new Set([...openTabs, ...workspace, ...groups.flatMap((g) => g.repos)])]
}

/** The sections to show: each group with its repos, then any repo in no group (under a null name). */
export function groupedSections(repos: string[], groups: RepoGroup[]): { name: string | null; repos: string[] }[] {
  const grouped = new Set(groups.flatMap((g) => g.repos))
  const sections: { name: string | null; repos: string[] }[] = groups.map((g) => ({
    name: g.name,
    repos: g.repos.filter((r) => repos.includes(r))
  }))
  const rest = repos.filter((r) => !grouped.has(r))
  if (rest.length > 0) sections.push({ name: null, repos: rest })
  return sections
}

/** Moves `repo` into the group named `group`, or out of every group when it's null. */
export function moveRepoToGroup(groups: RepoGroup[], repo: string, group: string | null): RepoGroup[] {
  return groups.map((g) => {
    const without = g.repos.filter((r) => r !== repo)
    return g.name === group ? { ...g, repos: [...without, repo] } : { ...g, repos: without }
  })
}

