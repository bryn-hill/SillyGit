import { runGit } from './gitExec'
import { credentialsFor } from './accounts'
import { parseRemoteUrl, type ProviderAccount } from '../shared/accounts'
import { toGithubRepo, type GithubRepo } from './github'
import type { Credentials } from './providerApi'

/** Where the repo's remotes live, origin first. */
export async function remoteLocations(repoPath: string): Promise<{ remote: string; host: string; path: string }[]> {
  const out = await runGit(repoPath, ['remote', '-v']).catch(() => '')
  const found = new Map<string, { remote: string; host: string; path: string }>()
  for (const line of out.split('\n')) {
    const [remote, url] = line.split(/\s+/)
    if (!remote || !url || found.has(remote)) continue
    const parsed = parseRemoteUrl(url)
    if (parsed) found.set(remote, { remote, ...parsed })
  }
  return [...found.values()].sort((a, b) => Number(b.remote === 'origin') - Number(a.remote === 'origin'))
}

export interface GithubAccess {
  repo: GithubRepo
  creds: Credentials
  account: ProviderAccount
}

/** The repo's GitHub remote and a signed-in account for its host, if both exist. */
export async function githubAccess(repoPath: string): Promise<GithubAccess | null> {
  for (const loc of await remoteLocations(repoPath)) {
    const repo = toGithubRepo(loc.host, loc.path)
    if (!repo) continue
    const signedIn = await credentialsFor(loc.host, 'github')
    if (signedIn) return { repo, ...signedIn }
  }
  return null
}
