import { existsSync } from 'fs'
import { join } from 'path'
import { repoNameFromUrl } from '../../shared/clone'
import { GitError, remoteEnv, runGit } from '../gitExec'

// Opening, creating and cloning repositories.

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

/** Clones `url` into a new folder named after it inside `parentDir`, returning the new repo's path. */
export async function clone(url: string, parentDir: string): Promise<string> {
  const name = repoNameFromUrl(url)
  if (!name) throw new GitError(`Couldn't work out a folder name from "${url}".`)
  const dest = join(parentDir, name)
  if (existsSync(dest)) throw new GitError(`${dest} already exists. Pick another folder to clone into.`)
  await runGit(parentDir, ['clone', '--', url.trim(), dest], await remoteEnv())
  return dest
}
