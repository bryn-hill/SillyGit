import { createHash } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import { basename, join } from 'path'
import { runGit } from './gitExec'
import { getRunCommand } from './settings'
import { buildRunScript, installCommandFor, lockfileFor, suggestRunCommand, type RunPlan } from '../shared/run'

// Where dependencies were installed from, inside node_modules so a fresh
// install (or deleting node_modules) clears it.
const INSTALL_MARKER = join('node_modules', '.sillygit-installed-lock')

/**
 * The private checkout a repo's commits are run in, under the app's data
 * folder so it never touches the user's working tree. One per repo, reused
 * (and its dependencies with it) from one run to the next.
 */
export function runCheckoutPath(runRoot: string, repoPath: string): string {
  const id = createHash('sha1').update(repoPath).digest('hex').slice(0, 10)
  const name = basename(repoPath).replace(/[^\w.-]+/g, '-') || 'repo'
  return join(runRoot, `${name}-${id}`)
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

/** The run command suggested for a repo that has none saved yet. */
export async function suggestCommand(repoPath: string): Promise<string> {
  const files = await listFiles(repoPath)
  const packageJson = files.includes('package.json')
    ? await fs.readFile(join(repoPath, 'package.json'), 'utf-8').catch(() => null)
    : null
  return suggestRunCommand(packageJson, files)
}

/** Puts the run checkout on `commit`, creating it (detached) the first time. */
async function checkOutForRun(repoPath: string, checkout: string, commit: string): Promise<void> {
  if (existsSync(join(checkout, '.git'))) {
    try {
      // Forced: this checkout is ours, and a build may have touched tracked files.
      await runGit(checkout, ['checkout', '--force', '--detach', commit])
      return
    } catch {
      // The checkout is broken or belongs to a repo that moved; start over.
      await fs.rm(checkout, { recursive: true, force: true })
    }
  }
  // Clears the record of a checkout whose folder was deleted.
  await runGit(repoPath, ['worktree', 'prune'])
  await fs.mkdir(join(checkout, '..'), { recursive: true })
  await runGit(repoPath, ['worktree', 'add', '--force', '--detach', checkout, commit])
}

/**
 * Copies the repo's untracked root `.env*` files into the checkout, since a
 * dev server usually can't start without them and they're never committed.
 */
async function copyEnvFiles(repoPath: string, checkout: string): Promise<void> {
  const tracked = new Set(
    (await runGit(checkout, ['ls-files', '--', '.env*']).catch(() => '')).split('\n').filter(Boolean)
  )
  for (const name of await listFiles(repoPath)) {
    if (!name.startsWith('.env') || tracked.has(name)) continue
    const source = join(repoPath, name)
    if ((await fs.stat(source)).isFile()) await fs.copyFile(source, join(checkout, name))
  }
}

/** The install step a checkout needs before running, or null when its dependencies are current. */
async function installStep(
  checkout: string
): Promise<{ command: string; marker: string; hash: string } | null> {
  const files = await listFiles(checkout)
  const command = installCommandFor(files)
  const lockfile = lockfileFor(files)
  if (!command || !lockfile) return null
  const hash = createHash('sha1')
    .update(await fs.readFile(join(checkout, lockfile)))
    .digest('hex')
  const marker = join(checkout, INSTALL_MARKER)
  const installed = await fs.readFile(marker, 'utf-8').catch(() => null)
  return installed === hash ? null : { command, marker, hash }
}

/**
 * Works out how to run the repo's run command: in the repo itself, or, given
 * a commit, in isolation: a separate checkout of that commit, so the user's
 * branch and uncommitted changes are left alone while it runs.
 */
export async function planRun(repoPath: string, commit: string | null, runRoot: string): Promise<RunPlan> {
  const command = await getRunCommand(repoPath)
  if (!command) throw new Error('No run command is set for this repository')
  if (!commit) return { cwd: repoPath, script: command, command, commit: null }

  const checkout = runCheckoutPath(runRoot, repoPath)
  await checkOutForRun(repoPath, checkout, commit)
  await copyEnvFiles(repoPath, checkout)
  const script = buildRunScript(command, await installStep(checkout), process.platform)
  return { cwd: checkout, script, command, commit }
}
