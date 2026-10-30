import { runGit } from './gitExec'
import { azureCredentialsFor, credentialsFor } from './accounts'
import { parseRemoteUrl, type ProviderAccount } from '../shared/accounts'
import { parseAzureRemote } from '../shared/azure'
import type { AzureAccess } from './azure'
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

/**
 * The repo's Azure DevOps access when its main remote (origin, else the
 * first) is on Azure DevOps; null when it isn't. Throws when it is but no
 * account is signed in for the organization, since nothing else can reach it.
 */
export async function azureAccess(repoPath: string): Promise<AzureAccess | null> {
  const loc = (await remoteLocations(repoPath))[0]
  const repo = loc && parseAzureRemote(loc.host, loc.path)
  if (!repo) return null
  const signedIn = await azureCredentialsFor(repo.organization)
  if (!signedIn) {
    throw new Error(
      `${repo.project}/${repo.name} is on Azure DevOps. Add a token for the ${repo.organization} organization in Settings → Accounts.`
    )
  }
  return { repo, remote: loc.remote, ...signedIn }
}
