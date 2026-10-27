import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  BlameLine,
  BranchInfo,
  CommitDetail,
  CommitFileChange,
  CommitInfo,
  ConflictableResult,
  FileStatus,
  GraphCommit,
  CommitSearchHit,
  RepoStatus,
  StashEntry
} from '../shared/types'
import * as diffSplit from '../shared/diffSplit'
import { planUndo, type UndoPlan } from '../shared/undo'
import { getOperationState, runMayConflict } from './conflicts'
import { GitError, remoteEnv, runGit } from './gitExec'

export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    const out = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export async function initRepo(repoPath: string): Promise<void> {
  await runGit(repoPath, ['init'])
}

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

export async function getDiff(repoPath: string, path: string, staged: boolean, untracked: boolean): Promise<string> {
  if (untracked) {
    try {
      const out = await runGit(repoPath, ['diff', '--no-color', '--no-index', '--', '/dev/null', path])
      return out
    } catch (err) {
      // git diff --no-index exits non-zero when files differ; the diff is still in the error output
      const message = err instanceof Error ? err.message : ''
      return message
    }
  }
  const args = staged
    ? ['diff', '--no-color', '--cached', '--', path]
    : ['diff', '--no-color', '--', path]
  return runGit(repoPath, args)
}

export async function listBranches(repoPath: string): Promise<BranchInfo[]> {
  const out = await runGit(repoPath, [
    'branch',
    '--list',
    '--format=%(HEAD)%09%(refname:short)%09%(objectname)%09%(upstream:short)'
  ])
  const local = out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [head, name, hash, upstream] = line.split('\t')
      return { name, current: head === '*', remote: false, hash, upstream: upstream || undefined }
    })

  const remoteOut = await runGit(repoPath, [
    'branch',
    '--list',
    '--remotes',
    '--format=%(refname:short)%09%(objectname)%09%(symref)'
  ])
  const remote = remoteOut
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => line.split('\t'))
    // Skip symbolic refs such as origin/HEAD.
    .filter(([name, , symref]) => !symref && name.includes('/'))
    .map(([name, hash]) => ({ name, current: false, remote: true, hash }))

  return [...local, ...remote]
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['checkout', branch])
}

export async function createBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['checkout', '-b', branch])
}

export async function fetchAll(repoPath: string): Promise<void> {
  await runGit(repoPath, ['fetch', '--all', '--prune', '--quiet'], await remoteEnv())
}

export async function push(repoPath: string): Promise<void> {
  await runGit(repoPath, ['push'], await remoteEnv())
}

export async function pull(repoPath: string): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['pull'], await remoteEnv())
}

export async function getLog(repoPath: string, limit = 50): Promise<CommitInfo[]> {
  const format = '%H%x09%an%x09%ad%x09%s'
  const out = await runGit(repoPath, [
    'log',
    `--max-count=${limit}`,
    `--format=${format}`,
    '--date=short'
  ])
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [hash, author, date, subject] = line.split('\t')
      return { hash, author, date, subject }
    })
}

const US = '\x1f' // unit separator, safe field delimiter
const RS = '\x1e' // record separator, safe commit delimiter

export const GRAPH_PAGE_SIZE = 500

export async function getGraphLog(repoPath: string, limit = GRAPH_PAGE_SIZE): Promise<GraphCommit[]> {
  const format = `%x1e%H${US}%P${US}%an${US}%ae${US}%ad${US}%s${US}%D`
  let out: string
  try {
    out = await runGit(repoPath, [
      'log',
      // Stashes get their own list; their internal commits only clutter the graph.
      '--exclude=refs/stash',
      '--all',
      '--date-order',
      `--max-count=${limit}`,
      `--format=${format}`,
      '--date=iso-strict'
    ])
  } catch {
    return []
  }
  return out
    .split(RS)
    .map((rec) => rec.trim())
    .filter((rec) => rec.length > 0)
    .map((rec) => {
      const [hash, parents, author, authorEmail, date, subject, refs] = rec.split(US)
      return {
        hash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author,
        authorEmail,
        date,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : []
      }
    })
}

function parseNameStatus(lines: string[]): CommitFileChange[] {
  const files: CommitFileChange[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const status = parts[0]
    if (status.startsWith('R') || status.startsWith('C')) {
      files.push({ status: status[0], origPath: parts[1], path: parts[2] })
    } else {
      files.push({ status, path: parts[1] })
    }
  }
  return files
}

export async function getCommitDetail(repoPath: string, hash: string): Promise<CommitDetail> {
  const format = `%H${US}%P${US}%an${US}%ae${US}%ad${US}%s${US}%b`
  const out = await runGit(repoPath, [
    'show',
    '--no-color',
    '--name-status',
    `--format=${format}`,
    '--date=iso-strict',
    hash
  ])
  const lines = out.split('\n')
  const headerLine = lines[0]
  const [h, parents, author, authorEmail, date, subject, ...bodyParts] = headerLine.split(US)
  // body may itself contain newlines captured in bodyParts plus following lines until a blank
  // separator before the file list; rejoin and then find where file status lines begin
  let body = bodyParts.join(US)
  let i = 1
  while (i < lines.length && !/^[A-Z]\d*\t/.test(lines[i])) {
    if (lines[i].trim().length > 0) body += (body ? '\n' : '') + lines[i]
    i++
  }
  const files = parseNameStatus(lines.slice(i))
  return {
    hash: h,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    author,
    authorEmail,
    date,
    subject,
    body: body.trim(),
    files
  }
}

export async function stash(repoPath: string, message?: string): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  await runGit(repoPath, message ? [...args, '-m', message] : args)
}

/** Pops `ref` (e.g. "stash@{2}"), or the newest stash when it's left out. */
export async function stashPop(repoPath: string, ref?: string): Promise<void> {
  await runGit(repoPath, ref ? ['stash', 'pop', ref] : ['stash', 'pop'])
}

export async function stashApply(repoPath: string, ref: string): Promise<void> {
  await runGit(repoPath, ['stash', 'apply', ref])
}

export async function stashDrop(repoPath: string, ref: string): Promise<void> {
  await runGit(repoPath, ['stash', 'drop', ref])
}

export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  let out: string
  try {
    out = await runGit(repoPath, ['stash', 'list', `--format=%gd${US}%H${US}%gs${US}%cI`])
  } catch {
    return []
  }
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [ref, hash, subject, date] = line.split(US)
      return { ref, hash, message: subject, date }
    })
}

export async function getCommitFileDiff(
  repoPath: string,
  hash: string,
  path: string,
  ignoreWhitespace = false
): Promise<string> {
  const args = ['show', '--no-color']
  if (ignoreWhitespace) args.push('-w')
  args.push('--format=', hash, '--', path)
  return runGit(repoPath, args)
}

export async function getCommitFullDiff(repoPath: string, hash: string): Promise<string> {
  return runGit(repoPath, ['show', '--no-color', '--format=', hash])
}

export async function getStagedDiff(repoPath: string): Promise<string> {
  return runGit(repoPath, ['diff', '--no-color', '--cached'])
}

export async function getHeadHash(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
}

export async function isWorkingTreeClean(repoPath: string): Promise<boolean> {
  const out = await runGit(repoPath, ['status', '--porcelain'])
  return out.trim().length === 0
}

export async function getTreeHash(repoPath: string, ref: string): Promise<string> {
  return (await runGit(repoPath, [`rev-parse`, `${ref}^{tree}`])).trim()
}

export async function getDiffForSplit(
  repoPath: string,
  parentHash: string,
  headHash: string
): Promise<string> {
  return runGit(repoPath, ['diff', '--no-color', '--binary', parentHash, headHash])
}

interface SplitCommitGroup {
  message: string
  patch: string
}

/**
 * Replaces the commit at `originalHead` (which must be the current HEAD and have
 * exactly one parent, `parentHash`) with one commit per group, applied in order.
 * Each group's `patch` must be the CUMULATIVE patch (this group's units plus every
 * earlier group's units) built against `parentHash`, so that `git apply --cached`
 * always starts from a clean, known base. Verifies the resulting tree matches
 * `expectedTreeHash` (the original commit's tree) and hard-resets back to
 * `originalHead` if anything doesn't check out, leaving the repo untouched.
 */
export async function applyCommitSplit(
  repoPath: string,
  originalHead: string,
  parentHash: string,
  expectedTreeHash: string,
  groups: SplitCommitGroup[]
): Promise<void> {
  const currentHead = await getHeadHash(repoPath)
  if (currentHead !== originalHead) {
    throw new GitError('HEAD has changed since the split was proposed. Please try again.')
  }
  if (!(await isWorkingTreeClean(repoPath))) {
    throw new GitError('Working directory must be clean before splitting a commit.')
  }

  await runGit(repoPath, ['reset', '--soft', parentHash])

  try {
    for (const group of groups) {
      await runGit(repoPath, ['read-tree', parentHash])
      const patchFile = join(tmpdir(), `sillygit-split-${randomUUID()}.patch`)
      await fsp.writeFile(patchFile, group.patch, 'utf-8')
      try {
        await runGit(repoPath, ['apply', '--cached', '--binary', '--whitespace=nowarn', patchFile])
      } finally {
        await fsp.unlink(patchFile).catch(() => {})
      }
      await runGit(repoPath, ['commit', '-m', group.message])
    }

    const newTree = await getTreeHash(repoPath, 'HEAD')
    if (newTree !== expectedTreeHash) {
      throw new GitError('Split result did not match the original commit; reverted.')
    }
  } catch (err) {
    await runGit(repoPath, ['reset', '--hard', originalHead]).catch(() => {})
    throw err
  }
}

export async function getFileAtRef(repoPath: string, ref: string, path: string): Promise<string> {
  return runGit(repoPath, ['show', `${ref}:${path}`])
}

export async function getWorkingFileContent(repoPath: string, path: string): Promise<string> {
  return fsp.readFile(join(repoPath, path), 'utf-8')
}

export async function getFileHistory(
  repoPath: string,
  path: string,
  fromRef: string,
  limit = 100
): Promise<CommitInfo[]> {
  const format = '%H%x09%an%x09%ad%x09%s'
  const out = await runGit(repoPath, [
    'log',
    fromRef,
    '--follow',
    `--max-count=${limit}`,
    `--format=${format}`,
    '--date=short',
    '--',
    path
  ])
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [hash, author, date, subject] = line.split('\t')
      return { hash, author, date, subject }
    })
}

/** Parses `git blame --porcelain` output into one entry per final-side line number. */
export async function getBlame(repoPath: string, ref: string, path: string): Promise<BlameLine[]> {
  const out = await runGit(repoPath, ['blame', '--porcelain', ref, '--', path])
  const lines = out.split('\n')
  const meta = new Map<string, { author: string; date: string; summary: string }>()
  const result: BlameLine[] = []

  let i = 0
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/)
    if (!headerMatch) {
      i++
      continue
    }
    const hash = headerMatch[1]
    const finalLine = Number(headerMatch[2])
    if (!meta.has(hash)) meta.set(hash, { author: '', date: '', summary: '' })
    i++
    while (i < lines.length && !lines[i].startsWith('\t')) {
      const line = lines[i]
      if (line.startsWith('author ')) meta.get(hash)!.author = line.slice(7)
      else if (line.startsWith('author-time ')) {
        meta.get(hash)!.date = new Date(Number(line.slice(12)) * 1000).toISOString()
      } else if (line.startsWith('summary ')) meta.get(hash)!.summary = line.slice(8)
      i++
    }
    const m = meta.get(hash)!
    result.push({ lineNo: finalLine, hash, author: m.author, date: m.date, summary: m.summary })
    i++ // consume the '\t<content>' line
  }
  return result
}

/**
 * Reverts a single hunk (identified by the stable unit id from `diffSplit.parseCommitDiff`)
 * by rebuilding a standalone patch for just that hunk and reverse-applying it to the
 * current WORKING TREE. This never touches the commit `diffText` was taken from — reverting
 * a hunk from a historical commit just undoes that one change in today's files, the same way
 * a normal uncommitted edit would. Fails loudly (rather than partially) if the file has
 * drifted too far since that commit for the patch context to match.
 */
export async function revertHunk(repoPath: string, diffText: string, unitId: string): Promise<void> {
  const { fileBlocks, units } = diffSplit.parseCommitDiff(diffText)
  if (!units.some((u) => u.id === unitId)) {
    throw new GitError('That change no longer matches the current diff; try again.')
  }
  const patch = diffSplit.buildPatchForUnits(fileBlocks, new Set([unitId]))
  const patchFile = join(tmpdir(), `sillygit-revert-${randomUUID()}.patch`)
  await fsp.writeFile(patchFile, patch, 'utf-8')
  try {
    await runGit(repoPath, ['apply', '-R', '--whitespace=nowarn', patchFile])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new GitError(
      `Could not revert this change — the file has likely changed since this commit. (${message})`
    )
  } finally {
    await fsp.unlink(patchFile).catch(() => {})
  }
}

/** Picks one commit, or several in the order given (oldest first). */
export async function cherryPick(repoPath: string, hash: string | string[]): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['cherry-pick', ...[hash].flat()])
}

/** Reverts one commit, or several in the order given (newest first). */
export async function revertCommit(repoPath: string, hash: string | string[]): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['revert', '--no-edit', ...[hash].flat()])
}

export async function resetTo(
  repoPath: string,
  hash: string,
  mode: 'soft' | 'mixed' | 'hard'
): Promise<void> {
  await runGit(repoPath, ['reset', `--${mode}`, hash])
}

export async function createBranchAt(
  repoPath: string,
  branch: string,
  startPoint: string,
  checkout = true
): Promise<void> {
  if (checkout) {
    await runGit(repoPath, ['checkout', '-b', branch, startPoint])
  } else {
    await runGit(repoPath, ['branch', branch, startPoint])
  }
}

export async function createTag(repoPath: string, name: string, hash: string): Promise<void> {
  await runGit(repoPath, ['tag', name, hash])
}

export async function createAnnotatedTag(
  repoPath: string,
  name: string,
  message: string,
  hash: string
): Promise<void> {
  await runGit(repoPath, ['tag', '-a', name, '-m', message, hash])
}

export async function createPatchFromCommit(repoPath: string, hash: string): Promise<string> {
  return runGit(repoPath, ['format-patch', '-1', hash, '--stdout'])
}

export { GitError }

/**
 * Every commit whose subject, author name or email contains `query`, or whose
 * hash starts with it, case-insensitively, with its position in the graph's
 * order. Scans all of history, not just what the graph has loaded, so the
 * graph can load further to reach a match.
 */
export async function searchCommits(repoPath: string, query: string, max = 2000): Promise<CommitSearchHit[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  let out: string
  try {
    out = await runGit(repoPath, [
      'log',
      '--exclude=refs/stash',
      '--all',
      '--date-order',
      `--format=%H${US}%an${US}%ae${US}%s`
    ])
  } catch {
    return []
  }
  const hits: CommitSearchHit[] = []
  const lines = out.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line) continue
    const [hash, author, email, subject] = line.split(US)
    if (
      hash.startsWith(needle) ||
      subject.toLowerCase().includes(needle) ||
      author.toLowerCase().includes(needle) ||
      email.toLowerCase().includes(needle)
    ) {
      hits.push({ hash, index })
      if (hits.length >= max) break
    }
  }
  return hits
}

async function newestReflogSubject(repoPath: string, ref: string): Promise<string | null> {
  try {
    const out = await runGit(repoPath, ['reflog', 'show', '-n', '1', '--format=%gs', ref, '--'])
    return out.trim() || null
  } catch {
    return null
  }
}

async function undoPlan(repoPath: string): Promise<{ plan: UndoPlan; ref: string } | null> {
  if (await getOperationState(repoPath)) return null
  let branch: string | null = null
  try {
    branch = (await runGit(repoPath, ['symbolic-ref', '-q', '--short', 'HEAD'])).trim() || null
  } catch {
    branch = null
  }
  const ref = branch ? `refs/heads/${branch}` : 'HEAD'
  const [headSubject, refSubject] = await Promise.all([
    newestReflogSubject(repoPath, 'HEAD'),
    newestReflogSubject(repoPath, ref)
  ])
  const plan = planUndo(headSubject, refSubject)
  if (!plan) return null
  if (plan.kind === 'reset') {
    // A reset to the commit it was already on (e.g. `git reset --hard` to
    // throw away edits) moved nothing, so there's nothing to go back to.
    try {
      const [now, before] = (await runGit(repoPath, ['rev-parse', ref, `${ref}@{1}`])).trim().split('\n')
      if (now === before) return null
    } catch {
      return null
    }
  }
  return { plan, ref }
}

/** What Undo would do right now, for the button's tooltip, or null when there's nothing to undo. */
export async function undoLabel(repoPath: string): Promise<string | null> {
  return (await undoPlan(repoPath))?.plan.label ?? null
}

/** Undoes the last commit, amend, checkout, merge, pull, rebase, reset, cherry-pick or revert. */
export async function undo(repoPath: string): Promise<string> {
  const found = await undoPlan(repoPath)
  if (!found) throw new GitError('There is nothing SillyGit can undo.')
  const { plan, ref } = found
  if (plan.kind === 'checkout') {
    await runGit(repoPath, ['checkout', plan.target])
    return plan.label
  }
  const previous = `${ref}@{1}`
  if (plan.mode === 'soft') {
    await runGit(repoPath, ['reset', '--soft', previous])
  } else {
    try {
      await runGit(repoPath, ['reset', '--keep', previous])
    } catch {
      if (plan.mode !== 'keep-or-mixed') {
        throw new GitError(
          `Couldn't ${plan.label.toLowerCase()} without touching your uncommitted changes. Commit or stash them first.`
        )
      }
      // A soft or mixed reset left the undone commits' changes in the working
      // tree; a mixed reset back takes them up again without touching files.
      await runGit(repoPath, ['reset', '--mixed', '--quiet', previous])
    }
  }
  return plan.label
}
