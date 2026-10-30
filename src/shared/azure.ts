// Azure DevOps (Azure Repos) remotes and pull request votes. A remote can be
// written four ways, all naming an organization, a project and a repository:
//   https://dev.azure.com/{org}/{project}/_git/{repo} (often with "{org}@" before the host)
//   git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
//   https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
//   {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}

/** A repository on Azure DevOps Services. */
export interface AzureRepo {
  organization: string
  project: string
  /** The repository's name, which can differ from the project's. */
  name: string
}

/** The host Azure DevOps accounts are added for; organizations tell them apart. */
export const AZURE_HOST = 'dev.azure.com'

/** Whether a remote host belongs to Azure DevOps Services. */
export function isAzureHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === AZURE_HOST || h === 'ssh.dev.azure.com' || h.endsWith('.visualstudio.com')
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/** Reads an Azure DevOps repository from a remote's host and path (as parseRemoteUrl splits them). */
export function parseAzureRemote(host: string, path: string): AzureRepo | null {
  const h = host.toLowerCase()
  const parts = path.split('/').filter(Boolean).map(decode)
  const repo = (organization: string, project: string, name: string): AzureRepo | null =>
    organization && project && name ? { organization, project, name } : null

  if (h === 'ssh.dev.azure.com' || h === 'vs-ssh.visualstudio.com') {
    // v3/{org}/{project}/{repo}
    return parts.length === 4 && parts[0] === 'v3' ? repo(parts[1], parts[2], parts[3]) : null
  }
  if (h === AZURE_HOST) {
    // {org}/{project}/_git/{repo}
    return parts.length === 4 && parts[2] === '_git' ? repo(parts[0], parts[1], parts[3]) : null
  }
  if (h.endsWith('.visualstudio.com')) {
    const organization = h.slice(0, -'.visualstudio.com'.length)
    const rest = parts[0]?.toLowerCase() === 'defaultcollection' ? parts.slice(1) : parts
    return rest.length === 3 && rest[1] === '_git' ? repo(organization, rest[0], rest[2]) : null
  }
  return null
}

const seg = (s: string): string => encodeURIComponent(s)

/** The repository's page, e.g. https://dev.azure.com/contoso/Web/_git/site. */
export function azureWebUrl(repo: AzureRepo): string {
  return `https://${AZURE_HOST}/${seg(repo.organization)}/${seg(repo.project)}/_git/${seg(repo.name)}`
}

export function azurePullRequestUrl(repo: AzureRepo, id: number): string {
  return `${azureWebUrl(repo)}/pullrequest/${id}`
}

export function azureWorkItemUrl(repo: AzureRepo, id: number): string {
  return `https://${AZURE_HOST}/${seg(repo.organization)}/${seg(repo.project)}/_workitems/edit/${id}`
}

/** The web form for a new pull request, with the branches picked. */
export function azureNewPullRequestUrl(webUrl: string, head: string, base: string): string {
  return `${webUrl}/pullrequestcreate?sourceRef=${encodeURIComponent(head)}&targetRef=${encodeURIComponent(base)}`
}

/** A web URL (from remoteWebUrl) that points at an Azure DevOps repository. */
export function isAzureWebUrl(webUrl: string | null): boolean {
  if (!webUrl) return false
  try {
    return isAzureHost(new URL(webUrl).hostname)
  } catch {
    return false
  }
}

/** "refs/heads/feature/x" -> "feature/x". */
export function branchFromRef(ref: string | undefined): string {
  return (ref ?? '').replace(/^refs\/heads\//, '')
}

/**
 * A reviewer's vote: 10 approved, 5 approved with suggestions, 0 no vote,
 * -5 waiting for the author, -10 rejected.
 */
export type AzureVote = 10 | 5 | 0 | -5 | -10

/**
 * The pull request's review state in GitHub's words, so Launchpad buckets and
 * the review screen treat both the same: any reviewer waiting or rejecting
 * means changes are requested; otherwise an approval approves it.
 */
export function reviewDecisionFromVotes(votes: number[]): '' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' {
  if (votes.length === 0) return ''
  if (votes.some((v) => v < 0)) return 'CHANGES_REQUESTED'
  if (votes.some((v) => v > 0)) return 'APPROVED'
  return 'REVIEW_REQUIRED'
}

export function voteLabel(vote: number): string {
  if (vote >= 10) return 'Approved'
  if (vote > 0) return 'Approved with suggestions'
  if (vote <= -10) return 'Rejected'
  if (vote < 0) return 'Waiting for author'
  return 'No vote'
}

/** Work item states that mean it's finished, across the Agile, Scrum, CMMI and Basic processes. */
export const CLOSED_WORK_ITEM_STATES = ['Closed', 'Done', 'Removed', 'Resolved', 'Completed', 'Cut']
