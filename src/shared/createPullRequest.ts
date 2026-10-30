import { guessProvider } from './accounts'
import { azureNewPullRequestUrl, isAzureWebUrl } from './azure'
import { splitRemoteRef } from './branchRemote'
import type { BranchInfo, RepoRemote } from './types'

/** What the Create pull request dialog sends to GitHub. Branches are names on the remote, without "origin/". */
export interface CreatePullRequestInput {
  base: string
  head: string
  title: string
  body: string
  draft: boolean
  /** GitHub logins to ask for a review. */
  reviewers: string[]
}

export interface CreatedPullRequest {
  number: number
  url: string
  title: string
  /** Set when the pull request was opened but asking for reviews failed. */
  reviewersError?: string
}

/**
 * Whether the head branch's commits are on the remote yet: a local branch
 * that was never pushed, one with commits its upstream doesn't have, or one
 * that's all there (remote branches always are).
 */
export type HeadState =
  | { kind: 'pushed'; remoteBranch: string }
  | { kind: 'ahead'; remoteBranch: string; ahead: number }
  | { kind: 'unpublished' }

/** A branch the dialog can open a pull request from, by its name in the graph. */
export interface HeadChoice {
  /** "feature/x" for a local branch, "origin/feature/x" for one only on the remote. */
  ref: string
  remote: string
  state: HeadState
}

/** The branches a pull request can come from: local ones, then remote ones with no local branch tracking them. */
export function headChoices(branches: BranchInfo[], remotes: RepoRemote[], remote: string): HeadChoice[] {
  const tracked = new Set<string>()
  const local: HeadChoice[] = []
  for (const b of branches) {
    if (b.remote) continue
    const split = b.upstream ? splitRemoteRef(b.upstream, remotes) : null
    // A branch tracking another remote is published there, not here.
    const upstream = split && split.remote.name === remote && !b.upstreamGone ? split.branch : null
    if (b.upstream) tracked.add(b.upstream)
    const state: HeadState = !upstream
      ? { kind: 'unpublished' }
      : b.ahead
        ? { kind: 'ahead', remoteBranch: upstream, ahead: b.ahead }
        : { kind: 'pushed', remoteBranch: upstream }
    local.push({ ref: b.name, remote, state })
  }
  const remoteOnly = baseChoices(branches, remotes, remote)
    .filter((name) => !tracked.has(`${remote}/${name}`))
    .map((name): HeadChoice => ({ ref: `${remote}/${name}`, remote, state: { kind: 'pushed', remoteBranch: name } }))
  return [...local, ...remoteOnly]
}

/** Branch names on `remote` a pull request can go into, without the remote prefix or its HEAD pointer. */
export function baseChoices(branches: BranchInfo[], remotes: RepoRemote[], remote: string): string[] {
  const names: string[] = []
  for (const b of branches) {
    if (!b.remote) continue
    const split = splitRemoteRef(b.name, remotes)
    if (split && split.remote.name === remote && split.branch !== 'HEAD') names.push(split.branch)
  }
  return names
}

/**
 * The base a new pull request most likely goes into: the branch it was asked
 * for if the remote has it, else main, master or develop, else the first.
 */
export function defaultBase(bases: string[], preferred: string | null, head: string | null): string | null {
  const usable = bases.filter((b) => b !== head)
  for (const name of [preferred, 'main', 'master', 'develop']) {
    if (name && usable.includes(name)) return name
  }
  return usable[0] ?? null
}

/** The remote branch a head will have once pushed: its upstream's name, or its own. */
export function headRemoteBranch(choice: HeadChoice): string {
  return choice.state.kind === 'unpublished' ? choice.ref : choice.state.remoteBranch
}

/** Splits "alice, @bob carol" into logins, dropping repeats and the @. */
export function parseReviewers(text: string): string[] {
  const seen = new Set<string>()
  const logins: string[] = []
  for (const part of text.split(/[\s,]+/)) {
    const login = part.replace(/^@/, '')
    if (!login || seen.has(login.toLowerCase())) continue
    seen.add(login.toLowerCase())
    logins.push(login)
  }
  return logins
}

/** Why the dialog can't create the pull request yet, or null when it can. */
export function createProblem(input: { base: string | null; head: HeadChoice | null; title: string }): string | null {
  if (!input.head) return 'Pick a branch to open the pull request from.'
  if (!input.base) return `${input.head.remote} has no branch to open the pull request into.`
  if (headRemoteBranch(input.head) === input.base) return 'The branch to merge and the base are the same branch.'
  if (!input.title.trim()) return 'Give the pull request a title.'
  return null
}

/**
 * Whether the app can open pull requests for a remote's web address: Azure
 * DevOps, or anything that could be GitHub (github.com, or a host that
 * isn't known to be GitLab or Bitbucket).
 */
export function canOpenPullRequests(webUrl: string | null): boolean {
  if (!webUrl) return false
  try {
    const provider = guessProvider(new URL(webUrl).hostname.toLowerCase())
    return provider === null || provider === 'github' || provider === 'azure'
  } catch {
    return false
  }
}

/** The service's name for links like "Open on GitHub". */
export function pullRequestHostLabel(webUrl: string | null): string {
  return isAzureWebUrl(webUrl) ? 'Azure DevOps' : 'GitHub'
}

/** The service's own new pull request form, with the branches picked. */
export function newPullRequestWebUrl(webUrl: string, base: string, head: string): string {
  if (isAzureWebUrl(webUrl)) return azureNewPullRequestUrl(webUrl, head, base)
  return `${webUrl}/compare/${encodeURI(base)}...${encodeURI(head)}?expand=1`
}
