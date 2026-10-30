import * as accounts from './accounts'
import { fetchJson } from './http'
import { apiBase, authHeaders, type Credentials } from './providerApi'
import { azureRequest } from './azure'
import { GitError, remoteEnv, runGit } from './gitExec'
import { AZURE_HOST } from '../shared/azure'
import type { ProviderAccount } from '../shared/accounts'
import {
  PUBLISH_REMOTE,
  gitHostAccounts,
  repoNameProblem,
  sortHostedRepos,
  withoutUserInfo,
  type HostedRepo,
  type HostedRepoList,
  type PublishInput,
  type PublishOwner,
  type PublishResult
} from '../shared/hostedRepos'

// The repositories a signed-in account can reach, for the clone dialog, and
// creating one on the host for "Publish repository".

/** Most pages read per account; at 100 a page that's the 1000 most recently changed repos. */
const MAX_PAGES = 10
const PAGE = 100

const seg = encodeURIComponent

type Repo = Omit<HostedRepo, 'accountId' | 'provider' | 'host'>

/** Reads numbered pages until one comes back short. */
async function pages<T>(url: (page: number) => string, creds: Credentials): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchJson<T[]>(url(page), { headers: authHeaders(creds) })
    all.push(...batch)
    if (batch.length < PAGE) break
  }
  return all
}

/** Follows Bitbucket's `next` links. */
async function bitbucketPages<T>(first: string, creds: Credentials): Promise<T[]> {
  const all: T[] = []
  let url: string | undefined = first
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: { values?: T[]; next?: string } = await fetchJson(url, { headers: authHeaders(creds) })
    all.push(...(res.values ?? []))
    url = res.next
  }
  return all
}

interface GithubRepo {
  full_name: string
  description: string | null
  private: boolean
  clone_url: string
  ssh_url?: string
  html_url?: string
  pushed_at?: string | null
  updated_at?: string | null
}

const fromGithub = (r: GithubRepo): Repo => ({
  fullName: r.full_name,
  description: r.description ?? '',
  private: r.private,
  cloneUrl: r.clone_url,
  sshUrl: r.ssh_url ?? null,
  webUrl: r.html_url ?? null,
  updatedAt: r.pushed_at ?? r.updated_at ?? null
})

interface GitlabProject {
  path_with_namespace: string
  description: string | null
  visibility?: string
  http_url_to_repo: string
  ssh_url_to_repo?: string
  web_url?: string
  last_activity_at?: string
}

const fromGitlab = (p: GitlabProject): Repo => ({
  fullName: p.path_with_namespace,
  description: p.description ?? '',
  private: p.visibility !== 'public',
  cloneUrl: p.http_url_to_repo,
  sshUrl: p.ssh_url_to_repo ?? null,
  webUrl: p.web_url ?? null,
  updatedAt: p.last_activity_at ?? null
})

interface BitbucketRepo {
  full_name: string
  description?: string
  is_private: boolean
  updated_on?: string
  links?: { clone?: { name: string; href: string }[]; html?: { href?: string } }
}

const fromBitbucket = (r: BitbucketRepo): Repo => {
  const https = r.links?.clone?.find((c) => c.name === 'https')?.href
  return {
    fullName: r.full_name,
    description: r.description ?? '',
    private: r.is_private,
    cloneUrl: withoutUserInfo(https ?? `https://bitbucket.org/${r.full_name}.git`),
    sshUrl: r.links?.clone?.find((c) => c.name === 'ssh')?.href ?? null,
    webUrl: r.links?.html?.href ?? null,
    updatedAt: r.updated_on ?? null
  }
}

interface AzureGitRepo {
  id: string
  name: string
  project?: { id: string; name: string }
  remoteUrl: string
  sshUrl?: string
  webUrl?: string
  isDisabled?: boolean
}

const fromAzure = (r: AzureGitRepo): Repo => ({
  fullName: `${r.project?.name ?? ''}/${r.name}`,
  description: '',
  // Azure DevOps sets visibility per project, and the repositories list doesn't say.
  private: true,
  cloneUrl: withoutUserInfo(r.remoteUrl),
  sshUrl: r.sshUrl ?? null,
  webUrl: r.webUrl ?? null,
  updatedAt: null
})

/** Bitbucket workspaces the account belongs to. The newer endpoint first; the older one is being retired. */
async function bitbucketWorkspaces(creds: Credentials): Promise<{ slug: string; name: string }[]> {
  const base = apiBase('bitbucket', creds.host)
  type Entry = { workspace?: { slug: string; name?: string }; slug?: string; name?: string }
  let entries: Entry[]
  try {
    entries = await bitbucketPages<Entry>(`${base}/user/workspaces?pagelen=100`, creds)
  } catch {
    entries = await bitbucketPages<Entry>(`${base}/workspaces?role=member&pagelen=100`, creds)
  }
  return entries
    .map((e) => e.workspace ?? { slug: e.slug ?? '', name: e.name })
    .filter((w) => w.slug)
    .map((w) => ({ slug: w.slug, name: w.name || w.slug }))
}

function azureOrgUrl(creds: Credentials): string {
  if (!creds.organization) throw new Error('This Azure DevOps account has no organization.')
  return `https://${AZURE_HOST}/${seg(creds.organization)}`
}

/** Every repository one account can reach, most recently changed first where the service says. */
export async function listReposFor(account: ProviderAccount, creds: Credentials): Promise<HostedRepo[]> {
  const base = apiBase(creds.provider, creds.host)
  let repos: Repo[]
  switch (creds.provider) {
    case 'github':
      repos = (
        await pages<GithubRepo>(
          (page) =>
            `${base}/user/repos?per_page=${PAGE}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
          creds
        )
      ).map(fromGithub)
      break
    case 'gitea':
      repos = (await pages<GithubRepo>((page) => `${base}/user/repos?limit=${PAGE}&page=${page}`, creds)).map(fromGithub)
      break
    case 'gitlab':
      repos = (
        await pages<GitlabProject>(
          (page) =>
            `${base}/projects?membership=true&simple=true&archived=false&order_by=last_activity_at&per_page=${PAGE}&page=${page}`,
          creds
        )
      ).map(fromGitlab)
      break
    case 'bitbucket': {
      const workspaces = await bitbucketWorkspaces(creds)
      const lists = await Promise.all(
        workspaces.map((w) =>
          bitbucketPages<BitbucketRepo>(`${base}/repositories/${seg(w.slug)}?pagelen=100&sort=-updated_on`, creds)
        )
      )
      repos = lists.flat().map(fromBitbucket)
      break
    }
    case 'azure': {
      const res = await azureRequest<{ value?: AzureGitRepo[] }>(creds.token, 'GET', `${azureOrgUrl(creds)}/_apis/git/repositories`)
      repos = (res?.value ?? []).filter((r) => !r.isDisabled).map(fromAzure)
      break
    }
    case 'jira':
      return []
  }
  return repos.map((r) => ({ ...r, accountId: account.id, provider: account.provider, host: account.host }))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The repositories of every signed-in git host account (or just `accountId`'s); one failing doesn't stop the rest. */
export async function listHostedRepos(accountId?: string): Promise<HostedRepoList> {
  const signedIn = gitHostAccounts(await accounts.listAccounts()).filter((a) => !accountId || a.id === accountId)
  const results = await Promise.all(
    signedIn.map(async (account) => {
      try {
        const found = await accounts.credentialsById(account.id)
        if (!found) throw new Error('Its token can\'t be read on this computer; add the account again.')
        return { repos: await listReposFor(account, found.creds) }
      } catch (err) {
        return { error: { accountId: account.id, message: errorMessage(err) } }
      }
    })
  )
  return {
    repos: sortHostedRepos(results.flatMap((r) => r.repos ?? [])),
    errors: results.flatMap((r) => (r.error ? [r.error] : []))
  }
}

/** Where `creds` can create a repository; the first is the default (the user's own space where there is one). */
export async function ownersFor(account: ProviderAccount, creds: Credentials): Promise<PublishOwner[]> {
  const base = apiBase(creds.provider, creds.host)
  const headers = authHeaders(creds)
  switch (creds.provider) {
    case 'github':
    case 'gitea': {
      const orgs = await fetchJson<{ login?: string; username?: string }[]>(`${base}/user/orgs?per_page=100`, { headers }).catch(
        () => []
      )
      const names = orgs.map((o) => o.login ?? o.username ?? '').filter(Boolean)
      return [{ id: '', label: `${account.username} (you)` }, ...names.map((n) => ({ id: `org:${n}`, label: n }))]
    }
    case 'gitlab': {
      // Namespaces where the user may create projects: their own and groups they're at least a Developer of.
      const namespaces = await fetchJson<{ id: number; full_path: string; kind: string }[]>(
        `${base}/namespaces?per_page=100`,
        { headers }
      )
      const own = namespaces.filter((n) => n.kind === 'user')
      const groups = namespaces.filter((n) => n.kind !== 'user')
      return [
        ...own.map((n) => ({ id: String(n.id), label: `${n.full_path} (you)` })),
        ...groups.map((n) => ({ id: String(n.id), label: n.full_path }))
      ]
    }
    case 'bitbucket':
      return (await bitbucketWorkspaces(creds)).map((w) => ({ id: w.slug, label: w.name }))
    case 'azure': {
      const res = await azureRequest<{ value?: { id: string; name: string }[] }>(
        creds.token,
        'GET',
        `${azureOrgUrl(creds)}/_apis/projects?$top=500`
      )
      return (res?.value ?? [])
        .map((p) => ({ id: p.id, label: p.name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'jira':
      return []
  }
}

/** Creates an empty repository on the host. */
export async function createRepo(
  creds: Credentials,
  input: Omit<PublishInput, 'accountId'>
): Promise<{ cloneUrl: string; webUrl: string | null }> {
  const base = apiBase(creds.provider, creds.host)
  const headers = { ...authHeaders(creds), 'Content-Type': 'application/json' }
  const post = <T>(url: string, body: unknown): Promise<T> =>
    fetchJson<T>(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const { name, description, owner } = input
  switch (creds.provider) {
    case 'github':
    case 'gitea': {
      const url = owner.startsWith('org:') ? `${base}/orgs/${seg(owner.slice(4))}/repos` : `${base}/user/repos`
      const repo = await post<GithubRepo>(url, { name, description, private: input.private })
      return { cloneUrl: repo.clone_url, webUrl: repo.html_url ?? null }
    }
    case 'gitlab': {
      const project = await post<GitlabProject>(`${base}/projects`, {
        name,
        path: name,
        description,
        visibility: input.private ? 'private' : 'public',
        ...(owner ? { namespace_id: Number(owner) } : {})
      })
      return { cloneUrl: project.http_url_to_repo, webUrl: project.web_url ?? null }
    }
    case 'bitbucket': {
      if (!owner) throw new Error('Pick a workspace.')
      const repo = await post<BitbucketRepo>(`${base}/repositories/${seg(owner)}/${seg(name.toLowerCase())}`, {
        scm: 'git',
        is_private: input.private,
        description
      })
      const created = fromBitbucket(repo)
      return { cloneUrl: created.cloneUrl, webUrl: created.webUrl }
    }
    case 'azure': {
      if (!owner) throw new Error('Pick a project.')
      const repo = await azureRequest<AzureGitRepo>(
        creds.token,
        'POST',
        `${azureOrgUrl(creds)}/${seg(owner)}/_apis/git/repositories`,
        { name, project: { id: owner } }
      )
      return { cloneUrl: withoutUserInfo(repo.remoteUrl), webUrl: repo.webUrl ?? null }
    }
    case 'jira':
      throw new Error('Jira doesn\'t host repositories.')
  }
}

async function signedInAccount(accountId: string): Promise<{ account: ProviderAccount; creds: Credentials }> {
  const found = await accounts.credentialsById(accountId)
  if (!found) throw new Error('That account is no longer signed in, or its token can\'t be read on this computer.')
  return found
}

export async function publishOwners(accountId: string): Promise<PublishOwner[]> {
  const { account, creds } = await signedInAccount(accountId)
  return ownersFor(account, creds)
}

/** The branch to publish: the checked-out one, which must have a commit. */
async function branchToPublish(repoPath: string): Promise<string> {
  const branch = (await runGit(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim()
  if (!branch) throw new GitError('Check out a branch before publishing.')
  try {
    await runGit(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  } catch {
    throw new GitError('Commit something before publishing: there is nothing to push yet.')
  }
  return branch
}

/**
 * Creates the repository on the account's host, adds it as `origin` and
 * pushes the checked-out branch to it, tracking it.
 */
export async function publishRepo(repoPath: string, input: PublishInput): Promise<PublishResult> {
  const name = input.name.trim()
  const problem = repoNameProblem(name)
  if (problem) throw new Error(problem)
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim())
  if (remotes.includes(PUBLISH_REMOTE)) throw new GitError(`This repository already has a remote called ${PUBLISH_REMOTE}.`)
  const branch = await branchToPublish(repoPath)

  const { creds } = await signedInAccount(input.accountId)
  let created: { cloneUrl: string; webUrl: string | null }
  try {
    created = await createRepo(creds, { ...input, name, description: input.description.trim() })
  } catch (err) {
    throw new Error(`Couldn't create the repository: ${errorMessage(err)}`)
  }

  await runGit(repoPath, ['remote', 'add', PUBLISH_REMOTE, created.cloneUrl])
  try {
    await runGit(repoPath, ['push', '--set-upstream', PUBLISH_REMOTE, `refs/heads/${branch}:refs/heads/${branch}`], await remoteEnv())
  } catch (err) {
    throw new GitError(
      `The repository was created${created.webUrl ? ` at ${created.webUrl}` : ''} and added as ${PUBLISH_REMOTE}, but pushing failed: ${errorMessage(err)} Try Push again.`
    )
  }
  return { remote: PUBLISH_REMOTE, branch, ...created }
}
