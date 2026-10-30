import { realpathSync } from 'fs'
import { resolve } from 'path'
import type { SubmoduleInfo, TagInfo, WorktreeInfo } from '../../shared/types'
import { GitError, remoteEnv, runGit } from '../gitExec'

// The side bar's lists of tags, worktrees and submodules, and what their menus do.

const FS = '\x1f'

/** Tags, newest first. */
export async function listTags(repoPath: string): Promise<TagInfo[]> {
  const out = await runGit(repoPath, [
    'for-each-ref',
    '--sort=-creatordate',
    `--format=%(refname:short)${FS}%(objecttype)${FS}%(objectname)${FS}%(*objectname)${FS}%(contents:subject)${FS}%(*subject)${FS}%(creatordate:unix)`,
    'refs/tags'
  ])
  return out
    .split('\n')
    .filter(Boolean)
    .map((row) => {
      const [name, type, object, peeled, subject, commitSubject, date] = row.split(FS)
      const annotated = type === 'tag'
      return {
        name,
        hash: annotated ? peeled : object,
        annotated,
        subject: (annotated ? subject : commitSubject) || subject,
        date: Number(date) || 0
      }
    })
}

/** The remote tags are pushed to: origin, else the only one. */
async function tagRemote(repoPath: string): Promise<string> {
  const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!remote) throw new GitError('This repository has no remote to push to.')
  return remote
}

export async function pushTag(repoPath: string, name: string): Promise<void> {
  await runGit(repoPath, ['push', await tagRemote(repoPath), `refs/tags/${name}`], await remoteEnv())
}

/** Deletes a tag here, and from the remote too when `remote` is set. */
export async function deleteTag(repoPath: string, name: string, remote: boolean): Promise<void> {
  if (remote) await runGit(repoPath, ['push', await tagRemote(repoPath), '--delete', `refs/tags/${name}`], await remoteEnv())
  await runGit(repoPath, ['tag', '-d', name])
}

function samePath(a: string, b: string): boolean {
  const real = (p: string): string => {
    try {
      return realpathSync(p)
    } catch {
      return resolve(p)
    }
  }
  return real(a) === real(b)
}

/** Parses `git worktree list --porcelain`: blocks of "key value" lines split by blank lines. */
export function parseWorktrees(out: string, repoPath: string): WorktreeInfo[] {
  return out
    .split('\n\n')
    .map((block) => block.split('\n').filter(Boolean))
    .filter((lines) => lines.length > 0 && lines[0].startsWith('worktree '))
    .filter((lines) => !lines.includes('bare'))
    .map((lines, i) => {
      const field = (key: string): string | null => {
        const line = lines.find((l) => l === key || l.startsWith(`${key} `))
        return line == null ? null : line.slice(key.length + 1)
      }
      const path = field('worktree')!
      const branch = field('branch')
      return {
        path,
        branch: branch ? branch.replace(/^refs\/heads\//, '') : null,
        head: field('HEAD'),
        // git always lists the main working tree first.
        main: i === 0,
        current: samePath(path, repoPath),
        locked: field('locked') !== null,
        prunable: field('prunable') !== null
      }
    })
}

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return parseWorktrees(await runGit(repoPath, ['worktree', 'list', '--porcelain']), repoPath)
}

/** Removes a linked worktree. Without `force`, git refuses if it has uncommitted changes. */
export async function removeWorktree(repoPath: string, path: string, force: boolean): Promise<void> {
  try {
    await runGit(repoPath, ['worktree', 'remove', ...(force ? ['--force'] : []), path])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/contains modified or untracked files/.test(message)) {
      throw new GitError(`${path} has uncommitted changes. Remove it anyway to throw them away.`)
    }
    throw err
  }
}

export async function pruneWorktrees(repoPath: string): Promise<void> {
  await runGit(repoPath, ['worktree', 'prune'])
}

const SUBMODULE_STATE: Record<string, SubmoduleInfo['state']> = {
  ' ': 'ok',
  '-': 'uninitialized',
  '+': 'modified',
  U: 'conflict'
}

/** Parses `git submodule status`: a state character, the commit, the path and maybe a describe in brackets. */
export function parseSubmodules(out: string): SubmoduleInfo[] {
  return out
    .split('\n')
    .map((line) => /^([ +\-U])([0-9a-f]+) (.+?)(?: \(.*\))?$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ state: SUBMODULE_STATE[m[1]], hash: m[2], path: m[3] }))
}

export async function listSubmodules(repoPath: string): Promise<SubmoduleInfo[]> {
  // `submodule status` fails outright on a broken .gitmodules; show none rather than an error.
  const out = await runGit(repoPath, ['submodule', 'status']).catch(() => '')
  return parseSubmodules(out)
}

/** Checks out the recorded commit in a submodule (or all of them), cloning it first if needed. */
export async function updateSubmodules(repoPath: string, path: string | null): Promise<void> {
  await runGit(repoPath, ['submodule', 'update', '--init', '--recursive', ...(path ? ['--', path] : [])], await remoteEnv())
}
