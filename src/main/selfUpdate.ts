import { spawn } from 'child_process'
import { GitError, remoteEnv, runGit } from './gitExec'
import {
  INCOMING_LIMIT,
  UPDATE_BRANCH,
  blockedReason,
  needsInstall,
  type SelfUpdateResult,
  type SelfUpdateStatus,
  type SelfUpdateStep
} from '../shared/selfUpdate'

const UPSTREAM = `origin/${UPDATE_BRANCH}`

export interface CheckoutSource {
  /** app.isPackaged: an installed build (npm run dist) has no checkout to pull into. */
  isPackaged: boolean
  isE2E: boolean
  /** SILLYGIT_UPDATE_CHECKOUT, which e2e tests point at a scratch clone. */
  override: string | undefined
  appPath: string
}

/**
 * The checkout SillyGit updates, or null when it can't update itself. A
 * packaged build never can, whatever the environment says, so the Update
 * button, dialog, palette entry and background checks all stay off there.
 */
export async function resolveCheckout(src: CheckoutSource): Promise<string | null> {
  if (src.isPackaged) return null
  if (src.override) return src.override
  if (src.isE2E) return null
  return findCheckout(src.appPath)
}

/** The top of the git checkout at `appPath`, or null when it isn't in one. */
export async function findCheckout(appPath: string): Promise<string | null> {
  try {
    return (await runGit(appPath, ['rev-parse', '--show-toplevel'])).trim() || null
  } catch {
    return null
  }
}

async function fetchMain(root: string): Promise<void> {
  await runGit(root, ['fetch', '--quiet', 'origin', `+refs/heads/${UPDATE_BRANCH}:refs/remotes/${UPSTREAM}`], await remoteEnv())
}

async function isDirty(root: string): Promise<boolean> {
  return (await runGit(root, ['status', '--porcelain', '--untracked-files=no'])).trim() !== ''
}

/** Where the checkout stands against origin/main, after fetching it unless `fetch` is false. */
export async function checkForUpdate(root: string, fetch = true): Promise<SelfUpdateStatus> {
  let error: string | null = null
  let checkedAt: number | null = null
  if (fetch) {
    try {
      await fetchMain(root)
      checkedAt = Date.now()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  const branch = (await runGit(root, ['branch', '--show-current'])).trim() || null
  let behind = 0
  let ahead = 0
  let incoming: SelfUpdateStatus['incoming'] = []
  try {
    const counts = (await runGit(root, ['rev-list', '--left-right', '--count', `HEAD...${UPSTREAM}`])).trim()
    ;[ahead, behind] = counts.split(/\s+/).map(Number)
    const log = await runGit(root, ['log', `--max-count=${INCOMING_LIMIT}`, '--format=%h%x09%s', `HEAD..${UPSTREAM}`])
    incoming = log
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...subject] = line.split('\t')
        return { hash, subject: subject.join('\t') }
      })
  } catch (err) {
    // No origin/main yet: the fetch failed, or origin has no main.
    error ??= err instanceof Error ? err.message : String(err)
  }
  return {
    supported: true,
    root,
    branch,
    behind,
    ahead,
    incoming,
    dirty: await isDirty(root),
    blocked: blockedReason(branch, ahead),
    checkedAt,
    error
  }
}

export interface UpdateHooks {
  onStep: (step: SelfUpdateStep) => void
  /** Runs `npm <args>` in the checkout; rejects with what it printed when it fails. */
  npm: (root: string, args: string[]) => Promise<void>
}

const STASH_MESSAGE = 'SillyGit update: local changes'

/**
 * Fast-forwards the checkout to origin/main, then runs npm install when the
 * dependencies changed and rebuilds. Uncommitted changes to tracked files
 * are stashed first and put back afterwards; when they no longer apply they
 * stay in the stash and the result names it.
 */
export async function applyUpdate(root: string, hooks: UpdateHooks): Promise<SelfUpdateResult> {
  hooks.onStep('fetching')
  const status = await checkForUpdate(root)
  if (status.error && status.checkedAt === null) throw new GitError(`Couldn't fetch the latest ${UPDATE_BRANCH}: ${status.error}`)
  if (status.blocked) throw new GitError(status.blocked)
  if (status.behind === 0) return { updated: false, installed: false, stashedChanges: null }

  hooks.onStep('pulling')
  const before = (await runGit(root, ['rev-parse', 'HEAD'])).trim()
  const stashed = status.dirty
  if (stashed) await runGit(root, ['stash', 'push', '--quiet', '-m', STASH_MESSAGE])
  try {
    await runGit(root, ['merge', '--ff-only', '--quiet', UPSTREAM])
  } catch (err) {
    if (stashed) await runGit(root, ['stash', 'pop', '--quiet']).catch(() => undefined)
    throw err
  }
  let stashedChanges: string | null = null
  if (stashed) {
    try {
      await runGit(root, ['stash', 'pop', '--quiet'])
    } catch {
      // The changes clash with the update. Pop keeps the stash when it
      // conflicts, so clear the half-applied result and leave them there.
      await runGit(root, ['reset', '--quiet', '--hard', 'HEAD'])
      stashedChanges = (await runGit(root, ['stash', 'list', '--max-count=1', '--format=%gd'])).trim() || 'stash@{0}'
    }
  }

  const changed = (await runGit(root, ['diff', '--name-only', before, 'HEAD'])).split('\n').filter(Boolean)
  const installed = needsInstall(changed)
  if (installed) {
    hooks.onStep('installing')
    await hooks.npm(root, ['install'])
  }
  hooks.onStep('building')
  await hooks.npm(root, ['run', 'build'])
  return { updated: true, installed, stashedChanges }
}

const OUTPUT_TAIL = 4000

function spawnNpm(command: string, args: string[], root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, shell: process.platform === 'win32' })
    let output = ''
    const collect = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${[command, ...args].join(' ')} failed (exit ${code}):\n${output.trim()}`))
    })
  })
}

/**
 * Runs npm in the checkout. When SillyGit was opened from the Dock or Finder
 * its PATH doesn't have the one the user's shell sets up (nvm, Homebrew), so
 * a missing npm is retried through their login shell.
 */
export async function runNpm(root: string, args: string[]): Promise<void> {
  try {
    await spawnNpm('npm', args, root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || process.platform === 'win32') throw err
    const shell = process.env['SHELL'] || '/bin/zsh'
    await spawnNpm(shell, ['-i', '-l', '-c', ['npm', ...args].join(' ')], root)
  }
}
