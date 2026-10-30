// Pure helpers for the side bar's Remotes list.

export interface RemoteLine {
  name: string
  url: string
  /** Only set when pushes go somewhere other than `url`. */
  pushUrl: string | null
}

/** Parses `git remote -v`: "name<TAB>url (fetch)" and "name<TAB>url (push)" for each remote, in order. */
export function parseRemoteList(out: string): RemoteLine[] {
  const remotes = new Map<string, { fetch: string | null; push: string | null }>()
  for (const line of out.split('\n')) {
    const m = /^(\S+)\s+(.+?)(?:\s+\((fetch|push)\))?$/.exec(line.trim())
    if (!m) continue
    const [, name, url, kind] = m
    const entry = remotes.get(name) ?? { fetch: null, push: null }
    if (kind === 'push') entry.push ??= url
    else entry.fetch ??= url
    remotes.set(name, entry)
  }
  return [...remotes].map(([name, { fetch, push }]) => {
    const url = fetch ?? push ?? ''
    return { name, url, pushUrl: push && push !== url ? push : null }
  })
}

/** The name to offer for a new remote: origin first, then upstream (the usual name for the repo you forked). */
export function suggestRemoteName(existing: string[]): string {
  if (!existing.includes('origin')) return 'origin'
  if (!existing.includes('upstream')) return 'upstream'
  return ''
}

/** A short form of a remote URL for the side bar, e.g. git@github.com:owner/repo.git -> github.com/owner/repo. */
export function shortRemoteUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(trimmed)
  if (scp && !/^[a-z]:$/i.test(`${scp[1]}:`)) return `${scp[1]}/${scp[2]}`
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i.exec(trimmed)
  if (parsed) return `${parsed[1].replace(/:\d+$/, '')}/${parsed[2]}`
  return trimmed
}

/** Why a remote name can't be used, or null when it's fine. Git checks the full rules; this catches the common slips. */
export function remoteNameProblem(name: string, existing: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name for the remote.'
  if (/\s/.test(trimmed)) return 'Remote names cannot contain spaces.'
  if (existing.includes(trimmed)) return `There is already a remote called ${trimmed}.`
  return null
}
