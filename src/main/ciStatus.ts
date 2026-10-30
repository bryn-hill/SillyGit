import { azureRequest, explainAzureError, type AzureAccess } from './azure'
import { transportFor, type GithubTransport } from './githubTransport'
import { azureAccess } from './hosting'
import { toCheck } from './prReview'
import { AZURE_HOST } from '../shared/azure'
import { cacheMs, ciState, sortChecks, type CiCheck, type CiRerun, type CiStatusMap, type CommitCiStatus } from '../shared/ciStatus'
import type { PrCheckState } from '../shared/prReview'

// CI results for the graph's commits, from GitHub (check runs and commit
// statuses) or Azure Pipelines (builds). Results are cached here, so the
// graph can ask on every refresh and only new or unsettled commits go out.

const HEX = /^[0-9a-f]{7,64}$/i

interface CacheEntry {
  status: CommitCiStatus | null
  until: number
}

const cache = new Map<string, Map<string, CacheEntry>>()
// Repos with no CI to ask (not hosted on GitHub or Azure DevOps, no account or gh CLI), until when.
const unavailable = new Map<string, number>()
const UNAVAILABLE_MS = 5 * 60_000

let now = (): number => Date.now()

/** For tests: a fake clock, and a clean cache. */
export function resetCiCache(clock: () => number = () => Date.now()): void {
  cache.clear()
  unavailable.clear()
  now = clock
}

type Source =
  | { kind: 'github'; transport: GithubTransport }
  | { kind: 'azure'; access: AzureAccess }

async function sourceFor(repoPath: string): Promise<Source> {
  const azure = await azureAccess(repoPath)
  if (azure) return { kind: 'azure', access: azure }
  return { kind: 'github', transport: await transportFor(repoPath) }
}

/**
 * CI status for each commit asked for that the host knows. Commits it has
 * no checks for come back null; when the repo has no CI to ask (or asking
 * fails) the answer is empty.
 */
export async function getCiStatuses(repoPath: string, shas: string[]): Promise<CiStatusMap> {
  const t = now()
  if ((unavailable.get(repoPath) ?? 0) > t) return {}
  let known = cache.get(repoPath)
  if (!known) cache.set(repoPath, (known = new Map()))
  const out: CiStatusMap = {}
  const wanted: string[] = []
  for (const sha of new Set(shas.filter((s) => HEX.test(s)))) {
    const hit = known.get(sha)
    if (hit && hit.until > t) out[sha] = hit.status
    else wanted.push(sha)
  }
  if (wanted.length === 0) return out
  let fetched: Map<string, CommitCiStatus | null>
  try {
    const source = await sourceFor(repoPath)
    fetched =
      source.kind === 'github' ? await githubStatuses(source.transport, wanted) : await azureStatuses(source.access, wanted)
  } catch {
    unavailable.set(repoPath, t + UNAVAILABLE_MS)
    return out
  }
  for (const sha of wanted) {
    const status = fetched.get(sha) ?? null
    known.set(sha, { status, until: t + cacheMs(status) })
    out[sha] = status
  }
  return out
}

/** Starts the failed checks again, and forgets the commit's cached status so the next look shows them running. */
export async function rerunCi(repoPath: string, sha: string, targets: CiRerun[]): Promise<void> {
  const source = await sourceFor(repoPath)
  for (const target of targets) {
    if (source.kind === 'github') {
      const { owner, name } = source.transport.repo
      if (target.kind === 'github-workflow-run')
        await source.transport.rest('POST', `repos/${owner}/${name}/actions/runs/${target.id}/rerun-failed-jobs`)
      else if (target.kind === 'github-check-run')
        await source.transport.rest('POST', `repos/${owner}/${name}/check-runs/${target.id}/rerequest`)
    } else if (target.kind === 'azure-build') {
      await azureCall(source.access, 'PATCH', `${projectUrl(source.access)}/_apis/build/builds/${target.id}?retry=true`, {})
    }
  }
  cache.get(repoPath)?.delete(sha)
}

// ---- GitHub ---------------------------------------------------------------

// Each commit lists up to 50 checks; this many commits per query keeps it well inside GitHub's limits.
const GITHUB_BATCH = 25

type GqlContext =
  | {
      __typename: 'CheckRun'
      databaseId: number | null
      name: string
      status: string
      conclusion: string | null
      detailsUrl: string | null
      title: string | null
      checkSuite: { workflowRun: { databaseId: number } | null } | null
    }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl: string | null; description: string | null }

type GqlCommit = { statusCheckRollup: { contexts: { nodes: (GqlContext | Record<string, never>)[] } } | null } | null

export function githubCheck(c: GqlContext): CiCheck {
  const check: CiCheck = toCheck(c)
  if (c.__typename === 'CheckRun') {
    const run = c.checkSuite?.workflowRun?.databaseId
    if (run) check.rerun = { kind: 'github-workflow-run', id: run }
    else if (c.databaseId) check.rerun = { kind: 'github-check-run', id: c.databaseId }
  }
  return check
}

export function githubStatus(sha: string, commit: GqlCommit): CommitCiStatus | null {
  const nodes = commit?.statusCheckRollup?.contexts.nodes ?? []
  const checks = sortChecks(nodes.filter((n): n is GqlContext => '__typename' in n).map(githubCheck))
  return checks.length ? { sha, state: ciState(checks), checks } : null
}

async function githubStatuses(transport: GithubTransport, shas: string[]): Promise<Map<string, CommitCiStatus | null>> {
  const out = new Map<string, CommitCiStatus | null>()
  for (let i = 0; i < shas.length; i += GITHUB_BATCH) {
    const batch = shas.slice(i, i + GITHUB_BATCH)
    const fields = batch
      .map(
        (sha, j) => `c${j}: object(oid: "${sha}") { ... on Commit { statusCheckRollup { contexts(first: 50) { nodes {
          __typename
          ... on CheckRun { databaseId name status conclusion detailsUrl title checkSuite { workflowRun { databaseId } } }
          ... on StatusContext { context state targetUrl description }
        } } } } }`
      )
      .join('\n')
    const data = await transport.graphql<{ repository: Record<string, GqlCommit> | null }>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
      { owner: transport.repo.owner, name: transport.repo.name }
    )
    batch.forEach((sha, j) => out.set(sha, githubStatus(sha, data.repository?.[`c${j}`] ?? null)))
  }
  return out
}

// ---- Azure Pipelines --------------------------------------------------------

export interface AzBuild {
  id: number
  buildNumber?: string
  status?: string
  result?: string
  sourceVersion?: string
  definition?: { id?: number; name?: string }
  _links?: { web?: { href?: string } }
}

const seg = encodeURIComponent

function projectUrl(access: AzureAccess): string {
  return `https://${AZURE_HOST}/${seg(access.repo.organization)}/${seg(access.repo.project)}`
}

function azureCall<T>(access: AzureAccess, method: string, url: string, body?: unknown): Promise<T> {
  return azureRequest<T>(access.creds.token, method, url, body).catch((err: unknown) => explainAzureError(access, err))
}

export function azureCheck(b: AzBuild, projectBase: string): CiCheck {
  let state: PrCheckState
  if (b.status !== 'completed') state = 'pending'
  else if (b.result === 'succeeded') state = 'success'
  else if (b.result === 'failed' || b.result === 'partiallySucceeded') state = 'failure'
  else state = 'neutral'
  const description =
    b.status !== 'completed'
      ? b.status === 'notStarted'
        ? 'Queued'
        : 'Running'
      : b.result === 'partiallySucceeded'
        ? 'Partially succeeded'
        : b.result === 'canceled'
          ? 'Cancelled'
          : b.buildNumber
  return {
    name: b.definition?.name ?? `Build ${b.id}`,
    state,
    url: b._links?.web?.href ?? `${projectBase}/_build/results?buildId=${b.id}`,
    description,
    ...(state === 'failure' ? { rerun: { kind: 'azure-build', id: b.id } as const } : {})
  }
}

/** The newest build of each pipeline for each commit asked for; builds come newest first. */
export function azureStatusesFromBuilds(builds: AzBuild[], shas: string[], projectBase: string): Map<string, CommitCiStatus | null> {
  const wanted = new Set(shas)
  const latest = new Map<string, Map<string, AzBuild>>()
  for (const b of builds) {
    const sha = shas.find((s) => b.sourceVersion?.toLowerCase().startsWith(s.toLowerCase()))
    if (!sha || !wanted.has(sha)) continue
    let byPipeline = latest.get(sha)
    if (!byPipeline) latest.set(sha, (byPipeline = new Map()))
    const key = String(b.definition?.id ?? b.definition?.name ?? b.id)
    if (!byPipeline.has(key)) byPipeline.set(key, b)
  }
  const out = new Map<string, CommitCiStatus | null>()
  for (const sha of shas) {
    const found = latest.get(sha)
    const checks = found ? sortChecks([...found.values()].map((b) => azureCheck(b, projectBase))) : []
    out.set(sha, checks.length ? { sha, state: ciState(checks), checks } : null)
  }
  return out
}

const repoIds = new Map<string, string>()

async function azureStatuses(access: AzureAccess, shas: string[]): Promise<Map<string, CommitCiStatus | null>> {
  const base = projectUrl(access)
  const key = `${base}/${access.repo.name}`
  let repoId = repoIds.get(key)
  if (!repoId) {
    const repo = await azureCall<{ id: string }>(access, 'GET', `${base}/_apis/git/repositories/${seg(access.repo.name)}`)
    repoIds.set(key, (repoId = repo.id))
  }
  // The builds API can't filter by commit, so read the repo's recent builds and match them up.
  const builds = await azureCall<{ value: AzBuild[] }>(
    access,
    'GET',
    `${base}/_apis/build/builds?repositoryId=${seg(repoId)}&repositoryType=TfsGit&queryOrder=queueTimeDescending&$top=200`
  )
  return azureStatusesFromBuilds(builds.value, shas, base)
}
