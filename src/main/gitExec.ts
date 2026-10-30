import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { formatCommand, isLoggedCommand, type ActivityEntry } from '../shared/activity'

const execFileAsync = promisify(execFile)

export class GitError extends Error {
  /** What the command printed before failing; some commands, like `diff --no-index`, exit non-zero on success. */
  stdout = ''
}

const ACTIVITY_LIMIT = 300
const activity: ActivityEntry[] = []
let nextActivityId = 1

/** The commands that changed something, newest first. */
export function activityLog(): ActivityEntry[] {
  return [...activity].reverse()
}

// Commands that change a repo run one at a time per repo: two at once (quick
// clicks taking a side on two conflicted files, say) trip over git's
// index.lock and one fails. Talking to a remote doesn't touch the index, so
// a slow fetch or push doesn't hold up the rest.
const REMOTE_ONLY = new Set(['fetch', 'push', 'clone', 'ls-remote'])
const writeQueues = new Map<string, Promise<unknown>>()

// Commands that move remote-tracking refs also run one at a time per repo,
// in a queue of their own: an auto-fetch landing in the middle of a pull
// makes one of them fail with "cannot lock ref 'refs/remotes/origin/main'".
const UPDATES_REMOTE_REFS = new Set(['fetch', 'pull', 'push'])
const remoteQueues = new Map<string, Promise<unknown>>()

function oneAtATime<T>(queues: Map<string, Promise<unknown>>, repoPath: string, run: () => Promise<T>): Promise<T> {
  const result = (queues.get(repoPath) ?? Promise.resolve()).then(run)
  const done = result.catch(() => {})
  queues.set(repoPath, done)
  void done.then(() => {
    if (queues.get(repoPath) === done) queues.delete(repoPath)
  })
  return result
}

// The queue can't stop git outside the app (an editor's auto-fetch, a
// terminal) taking the same ref lock, so a fetch or pull that loses that race
// tries again after a moment. Either fails before changing anything else.
const REF_LOCK_RACE = /cannot lock ref|unable to update local ref/i
const REF_LOCK_RETRY_DELAYS_MS = [300, 1000]

export async function runGit(
  repoPath: string,
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  const logged = isLoggedCommand(args)
  let run = (): Promise<string> => execGit(repoPath, args, env, logged)
  if (logged && !REMOTE_ONLY.has(args[0])) {
    const write = run
    run = () => oneAtATime(writeQueues, repoPath, write)
  }
  if (UPDATES_REMOTE_REFS.has(args[0])) {
    const once = run
    run = () => oneAtATime(remoteQueues, repoPath, args[0] === 'push' ? once : () => retryRefLockRace(once))
  }
  return run()
}

async function retryRefLockRace<T>(run: () => Promise<T>): Promise<T> {
  for (const delay of REF_LOCK_RETRY_DELAYS_MS) {
    try {
      return await run()
    } catch (err) {
      if (!(err instanceof GitError) || !REF_LOCK_RACE.test(err.message)) throw err
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return run()
}

async function execGit(repoPath: string, args: string[], env: Record<string, string> | undefined, logged: boolean): Promise<string> {
  const started = Date.now()
  const record = (ok: boolean, error?: string): void => {
    if (!logged) return
    activity.push({
      id: nextActivityId++,
      time: started,
      repoPath,
      command: formatCommand(args),
      durationMs: Date.now() - started,
      ok,
      error
    })
    if (activity.length > ACTIVITY_LIMIT) activity.shift()
  }
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 * 64,
      env: env ? { ...process.env, ...env } : undefined
    })
    record(true)
    return stdout
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stderr = (err as { stderr?: string }).stderr
    const error = new GitError(stderr?.trim() || message)
    error.stdout = (err as { stdout?: string }).stdout ?? ''
    record(false, error.message)
    throw error
  }
}

/**
 * Runs git with `input` on stdin and returns stdout's raw bytes, for commands
 * that read their input (check-attr --stdin, lfs smudge). Not logged or queued:
 * only read-only commands use it.
 */
export function runGitWithInput(
  repoPath: string,
  args: string[],
  input: string | Buffer,
  env?: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoPath, env: env ? { ...process.env, ...env } : undefined })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', (e) => reject(new GitError(e.message)))
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new GitError(Buffer.concat(err).toString('utf8').trim() || `git ${args[0]} exited with ${code}`))
    })
    // A command that fails early stops reading; its exit code says why.
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

// Extra environment for commands that talk to a remote, e.g. the tokens of
// signed-in accounts (see accounts.ts). Set by the app at startup.
let networkEnv: () => Promise<Record<string, string>> = async () => ({})

export function setNetworkEnv(provider: () => Promise<Record<string, string>>): void {
  networkEnv = provider
}

/**
 * The environment for a command that talks to a remote: never sit waiting
 * for a username or password on a terminal nobody can see, and send the
 * tokens of signed-in accounts.
 */
export async function remoteEnv(): Promise<Record<string, string>> {
  let auth: Record<string, string> = {}
  try {
    auth = await networkEnv()
  } catch {
    // Without tokens git falls back to its own credential helpers.
  }
  return { GIT_TERMINAL_PROMPT: '0', ...auth }
}

/** Turns config entries into GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n, after any already set. */
export function gitConfigEnv(
  entries: { key: string; value: string }[],
  baseEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  if (entries.length === 0) return {}
  const start = Number(baseEnv['GIT_CONFIG_COUNT']) || 0
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(start + entries.length) }
  entries.forEach((entry, i) => {
    env[`GIT_CONFIG_KEY_${start + i}`] = entry.key
    env[`GIT_CONFIG_VALUE_${start + i}`] = entry.value
  })
  return env
}
