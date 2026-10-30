import { createHash } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import { runGit } from './gitExec'
import { getRunCommand, getRunCopyFiles } from './settings'
import {
  buildRunScript,
  installCommandFor,
  lockfileFor,
  shellQuote,
  splitLeadingCd,
  type RunPlan
} from '../shared/run'
import {
  BUILD_FILES,
  DEFAULT_RUN_COPY_PATTERNS,
  detectRunCommands,
  dotnetProjects,
  matchesPattern,
  type RunSuggestion
} from '../shared/runDetect'

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

const MAX_SUGGESTIONS = 8

async function readIn(dir: string, path: string): Promise<string | null> {
  return fs.readFile(join(dir, path), 'utf-8').catch(() => null)
}

/** The run commands that fit the project in `dir`, reading only the build files the guesses need. */
async function suggestIn(dir: string): Promise<RunSuggestion[]> {
  const files = await listFiles(dir)
  const contents: Record<string, string> = {}
  const read = async (path: string): Promise<void> => {
    const text = await readIn(dir, path)
    if (text != null) contents[path] = text
  }
  await Promise.all(BUILD_FILES.map(read))
  await Promise.all(files.filter((name) => name.endsWith('.sln')).map(read))
  await Promise.all(dotnetProjects(files, contents).map(read))
  return detectRunCommands({ files, contents }, process.platform)
}

/**
 * The run commands suggested for a repo, most likely first: what the repo
 * root can run, then what each subfolder can (an app next to its API, say),
 * changing into that folder first.
 */
export async function suggestCommands(repoPath: string): Promise<RunSuggestion[]> {
  const found = await suggestIn(repoPath)
  for (const name of (await listFiles(repoPath)).sort()) {
    if (found.length >= MAX_SUGGESTIONS) break
    if (name.startsWith('.') || name === 'node_modules') continue
    const sub = join(repoPath, name)
    if (!(await fs.stat(sub).catch(() => null))?.isDirectory()) continue
    const cd = `cd ${/^[\w.-]+$/.test(name) ? name : shellQuote(name)} && `
    for (const { command, label } of await suggestIn(sub)) found.push({ command: cd + command, label: `${label} in ${name}` })
  }
  return found.slice(0, MAX_SUGGESTIONS)
}

/** The run command suggested for a repo that has none saved yet, or '' when nothing fits. */
export async function suggestCommand(repoPath: string): Promise<string> {
  return (await suggestCommands(repoPath))[0]?.command ?? ''
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
  // A folder left by a checkout that failed part way would make `worktree add` refuse.
  await fs.rm(checkout, { recursive: true, force: true })
  // Clears the record of a checkout whose folder was deleted.
  await runGit(repoPath, ['worktree', 'prune'])
  await fs.mkdir(join(checkout, '..'), { recursive: true })
  await runGit(repoPath, ['worktree', 'add', '--force', '--detach', checkout, commit])
}

/** Makes sure the checkout really is on `commit`, so a run never starts in a half-made folder. */
async function verifyCheckout(checkout: string, commit: string): Promise<void> {
  const head = (await runGit(checkout, ['rev-parse', 'HEAD']).catch(() => '')).trim()
  const wanted = (await runGit(checkout, ['rev-parse', `${commit}^{commit}`]).catch(() => commit)).trim()
  if (head !== wanted) throw new Error(`Couldn't check out ${commit.slice(0, 7)} for the run in ${checkout}`)
}

/**
 * Copies files a run usually needs but that are never committed (`.env*`,
 * Android's local.properties, .NET's appsettings.*.json, and the repo's own
 * list) from the repo's run folder, and the folder the command changes into,
 * into the same places in the checkout. Files the commit tracks are left as
 * the commit has them.
 */
async function copyRunFiles(repoPath: string, checkout: string, dirs: string[], extra: string[]): Promise<void> {
  const wanted = new Set<string>()
  const addMatches = async (pattern: string): Promise<void> => {
    const folder = pattern.includes('/') ? pattern.slice(0, pattern.lastIndexOf('/')) : ''
    const base = pattern.slice(folder.length ? folder.length + 1 : 0)
    if (folder.includes('*')) return
    for (const name of await listFiles(join(repoPath, folder))) {
      if (matchesPattern(name, base)) wanted.add(folder ? `${folder}/${name}` : name)
    }
  }
  for (const dir of dirs) {
    for (const pattern of DEFAULT_RUN_COPY_PATTERNS) await addMatches(dir ? `${dir}/${pattern}` : pattern)
  }
  for (const pattern of extra) await addMatches(pattern)
  if (!wanted.size) return
  const tracked = new Set(
    (await runGit(checkout, ['ls-files', '--', ...wanted]).catch(() => '')).split('\n').filter(Boolean)
  )
  for (const path of wanted) {
    if (tracked.has(path)) continue
    const source = join(repoPath, path)
    if (!(await fs.stat(source).catch(() => null))?.isFile()) continue
    await fs.mkdir(dirname(join(checkout, path)), { recursive: true })
    await fs.copyFile(source, join(checkout, path))
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
  await verifyCheckout(checkout, commit)
  // A repo opened at a folder inside the git repository runs from that same
  // folder in the checkout, which holds the whole repository.
  const prefix = (await runGit(repoPath, ['rev-parse', '--show-prefix'])).trim().replace(/\/$/, '')
  const cwd = prefix ? join(checkout, prefix) : checkout
  if (!existsSync(cwd)) {
    throw new Error(`${prefix} doesn't exist at commit ${commit.slice(0, 7)}, so there's nothing to run there`)
  }
  // A command that starts with `cd app &&` installs app's dependencies, after the cd.
  const { dir, dirToken, rest } = splitLeadingCd(command)
  const cdDir = dir?.replace(/\\/g, '/').replace(/^\.\/|\/$/g, '') ?? ''
  const dirs = cdDir && cdDir !== '.' && !cdDir.split('/').includes('..') ? ['', cdDir] : ['']
  await copyRunFiles(repoPath, cwd, dirs, await getRunCopyFiles(repoPath))
  const script = dir
    ? `cd ${dirToken} && ${buildRunScript(rest, await installStep(join(cwd, dir)), process.platform)}`
    : buildRunScript(command, await installStep(cwd), process.platform)
  return { cwd, script, command, commit }
}
