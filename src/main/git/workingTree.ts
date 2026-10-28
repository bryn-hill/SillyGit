import { promises as fsp } from 'fs'
import { join } from 'path'
import type { FileStatus, RepoStatus } from '../../shared/types'
import { GitError, runGit } from '../gitExec'

// The working tree and index: status, staging, discarding, diffs and committing.

/** Parses `git status --porcelain=v2 -z`, whose paths are never quoted and may hold any character. */
function parsePorcelainV2(output: string): RepoStatus {
  const status: RepoStatus = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    conflicted: []
  }

  const records = output.split('\0')

  // The path is everything after the fixed fields, so it may contain spaces.
  const fieldsAndPath = (line: string, fieldCount: number): [string[], string] => {
    const fields = line.split(' ', fieldCount)
    return [fields, line.slice(fields.join(' ').length + 1)]
  }

  for (let r = 0; r < records.length; r++) {
    const line = records[r]
    if (line.length === 0) continue
    if (line.startsWith('# branch.head ')) {
      status.branch = line.slice('# branch.head '.length)
      if (status.branch === '(detached)') status.branch = null
    } else if (line.startsWith('# branch.upstream ')) {
      status.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/)
      if (match) {
        status.ahead = parseInt(match[1], 10)
        status.behind = parseInt(match[2], 10)
      }
    } else if (line.startsWith('1 ')) {
      const [fields, path] = fieldsAndPath(line, 8)
      const xy = fields[1]
      pushEntry(status, { path, index: xy[0], worktree: xy[1], untracked: false })
    } else if (line.startsWith('2 ')) {
      // A rename or copy: one more field (its score), and the original path in the next record.
      const [fields, path] = fieldsAndPath(line, 9)
      const xy = fields[1]
      const origPath = records[++r]
      pushEntry(status, { path, origPath, index: xy[0], worktree: xy[1], untracked: false })
    } else if (line.startsWith('u ')) {
      const [fields, path] = fieldsAndPath(line, 10)
      const xy = fields[1]
      status.conflicted.push({ path, index: xy[0], worktree: xy[1], untracked: false })
    } else if (line.startsWith('? ')) {
      const path = line.slice(2)
      status.unstaged.push({ path, index: '?', worktree: '?', untracked: true })
    }
  }

  return status
}

function pushEntry(status: RepoStatus, entry: FileStatus): void {
  if (entry.index === 'U' || entry.worktree === 'U') {
    status.conflicted.push(entry)
    return
  }
  if (entry.index !== '.') {
    status.staged.push(entry)
  }
  if (entry.worktree !== '.') {
    status.unstaged.push(entry)
  }
}

export async function getStatus(repoPath: string): Promise<RepoStatus> {
  // No optional locks: status would otherwise rewrite .git/index to refresh
  // its stat cache, which the repo watcher would see as a change, refresh
  // again, and loop.
  const out = await runGit(
    repoPath,
    ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'],
    { GIT_OPTIONAL_LOCKS: '0' }
  )
  return parsePorcelainV2(out)
}

export async function stageFiles(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await runGit(repoPath, ['add', '--', ...paths])
}

export async function unstageFiles(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await runGit(repoPath, ['restore', '--staged', '--', ...paths])
}

export async function stageAll(repoPath: string): Promise<void> {
  await runGit(repoPath, ['add', '-A'])
}

export async function unstageAll(repoPath: string): Promise<void> {
  await runGit(repoPath, ['restore', '--staged', '.'])
}

export async function discardFile(repoPath: string, path: string, untracked: boolean): Promise<void> {
  if (untracked) {
    await runGit(repoPath, ['clean', '-f', '--', path])
  } else {
    await runGit(repoPath, ['checkout', '--', path])
  }
}

export async function commit(repoPath: string, message: string, amend = false): Promise<void> {
  await runGit(repoPath, amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message])
}

/** The full message of HEAD, to start an amend from. Empty in a repo with no commits. */
export async function lastCommitMessage(repoPath: string): Promise<string> {
  try {
    return (await runGit(repoPath, ['log', '-1', '--format=%B'])).trim()
  } catch {
    return ''
  }
}

export async function getDiff(
  repoPath: string,
  path: string,
  staged: boolean,
  untracked: boolean,
  ignoreWhitespace = false
): Promise<string> {
  const ws = ignoreWhitespace ? ['-w'] : []
  if (untracked) {
    try {
      return await runGit(repoPath, ['diff', '--no-color', ...ws, '--no-index', '--', '/dev/null', path])
    } catch (err) {
      // git diff --no-index exits 1 when the files differ, with the diff on stdout.
      if (err instanceof GitError && err.stdout) return err.stdout
      throw err
    }
  }
  const args = staged
    ? ['diff', '--no-color', ...ws, '--cached', '--', path]
    : ['diff', '--no-color', ...ws, '--', path]
  return runGit(repoPath, args)
}

export async function getStagedDiff(repoPath: string): Promise<string> {
  return runGit(repoPath, ['diff', '--no-color', '--cached'])
}

export async function isWorkingTreeClean(repoPath: string): Promise<boolean> {
  const out = await runGit(repoPath, ['status', '--porcelain'])
  return out.trim().length === 0
}

export async function getWorkingFileContent(repoPath: string, path: string): Promise<string> {
  return fsp.readFile(join(repoPath, path), 'utf-8')
}

/** Every file git tracks in the working tree, for picking one to blame or show the history of. */
export async function listTrackedFiles(repoPath: string): Promise<string[]> {
  const out = await runGit(repoPath, ['ls-files', '-z'])
  return out.split('\0').filter(Boolean)
}
