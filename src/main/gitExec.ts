import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export class GitError extends Error {}

export async function runGit(
  repoPath: string,
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 * 64,
      env: env ? { ...process.env, ...env } : undefined
    })
    return stdout
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stderr = (err as { stderr?: string }).stderr
    throw new GitError(stderr?.trim() || message)
  }
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
