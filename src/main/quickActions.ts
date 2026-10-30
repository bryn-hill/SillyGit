import { promises as fsp } from 'fs'
import { join } from 'path'
import {
  bumpVersion,
  buildPullRequestText,
  suggestCommitMessages,
  type BumpKind,
  type QuickMessage,
  type VersionBump
} from '../shared/quickActions'
import { withClosingIssue } from '../shared/issues'
import { runGit } from './gitExec'
import { getStagedDiff } from './git'
import { issueForBranch } from './issueWork'

async function readIfExists(path: string): Promise<string | null> {
  return fsp.readFile(path, 'utf8').catch(() => null)
}

/** The version in the repo's root package.json, or null when there isn't one. */
export async function getPackageVersion(repoPath: string): Promise<string | null> {
  const text = await readIfExists(join(repoPath, 'package.json'))
  if (!text) return null
  try {
    const version = (JSON.parse(text) as { version?: unknown }).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

/** Replaces the first `count` `"version": "<from>"` fields, keeping the file's formatting. */
function replaceVersionFields(text: string, from: string, to: string, count: number): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`("version"\\s*:\\s*")${escaped}(")`, 'g')
  let seen = 0
  return text.replace(pattern, (match, open: string, close: string) => (++seen <= count ? `${open}${to}${close}` : match))
}

/**
 * Bumps the version in package.json (and package-lock.json's own entries) and
 * returns the files it changed, for the caller to stage, and the commit message.
 */
export async function bumpPackageVersion(repoPath: string, kind: BumpKind): Promise<VersionBump> {
  const pkgPath = join(repoPath, 'package.json')
  const pkgText = await readIfExists(pkgPath)
  const from = await getPackageVersion(repoPath)
  if (!pkgText || !from) throw new Error('No version found in package.json.')
  const to = bumpVersion(from, kind)
  if (!to) throw new Error(`"${from}" is not a version SillyGit can bump.`)

  const nextPkg = replaceVersionFields(pkgText, from, to, 1)
  if ((JSON.parse(nextPkg) as { version?: string }).version !== to) {
    throw new Error('Could not find the version field in package.json.')
  }
  const files = ['package.json']
  await fsp.writeFile(pkgPath, nextPkg)

  // The lockfile repeats the version at the top and under packages[""].
  const lockPath = join(repoPath, 'package-lock.json')
  const lockText = await readIfExists(lockPath)
  if (lockText) {
    const nextLock = replaceVersionFields(lockText, from, to, 2)
    try {
      const lock = JSON.parse(nextLock) as { version?: string; packages?: Record<string, { version?: string }> }
      const rootOk = lock.packages?.[''] === undefined || lock.packages[''].version === to
      if (lock.version === to && rootOk) {
        await fsp.writeFile(lockPath, nextLock)
        files.push('package-lock.json')
      }
    } catch {
      // Leave a lockfile we can't parse alone.
    }
  }

  return { files, version: to, message: `chore: bump version to ${to}` }
}

/** Rule-based commit message suggestions for what is staged. */
export async function suggestForStaged(repoPath: string): Promise<QuickMessage[]> {
  return suggestCommitMessages(await getStagedDiff(repoPath))
}

/**
 * Pull request title and body from the commits on `head` that aren't on
 * `base`, closing the issue the branch was started from, if any.
 */
export async function pullRequestText(
  repoPath: string,
  base: string,
  head: string,
  headBranch: string
): Promise<{ title: string; body: string }> {
  const out = await runGit(repoPath, ['log', '--format=%H%x00%s%x00%b%x1e', `${base}..${head}`])
  const commits = out
    .split('\x1e')
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.trim())
    .map((r) => {
      const [hash, subject, body] = r.split('\x00')
      return { hash, subject, body: body ?? '' }
    })
  const text = buildPullRequestText(commits, headBranch)
  const issue = await issueForBranch(repoPath, headBranch)
  return issue ? { ...text, body: withClosingIssue(text.body, issue) } : text
}
