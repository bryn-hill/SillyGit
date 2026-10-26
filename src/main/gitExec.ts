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
