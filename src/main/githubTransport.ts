import { spawn } from 'child_process'
import * as github from './github'
import { githubAccess, remoteLocations } from './hosting'
import { fetchJson, HttpError } from './http'
import { apiBase, authHeaders } from './providerApi'

/**
 * How requests reach GitHub: the API with a signed-in account's token, or
 * else the gh CLI (`gh api`), which uses whatever `gh auth login` set up.
 */
export interface GithubTransport {
  repo: github.GithubRepo
  rest<T>(method: string, path: string, body?: unknown): Promise<T>
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>
}

function ghApi(cwd: string, host: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['api', '--hostname', host, ...args, ...(input !== undefined ? ['--input', '-'] : [])], {
      cwd
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e.code === 'ENOENT'
          ? new Error('Add a GitHub token in Settings (or install the GitHub CLI) to work with pull requests.')
          : e
      )
    )
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `gh exited with ${code}`))))
    child.stdin.end(input ?? '')
  })
}

export async function transportFor(repoPath: string): Promise<GithubTransport> {
  const access = await githubAccess(repoPath)
  if (access) {
    const { creds, repo, account } = access
    const explain = (err: unknown): never => {
      if (err instanceof HttpError && err.status === 401)
        throw new Error(`${repo.host} rejected the token for ${account.username}. Add it again in Settings.`)
      throw err
    }
    return {
      repo,
      rest: (method, path, body) =>
        fetchJson<never>(`${apiBase('github', repo.host)}/${path}`, {
          method,
          headers: { ...authHeaders(creds), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        }).catch(explain),
      graphql: (query, variables) => github.graphql<never>(creds, query, variables).catch(explain)
    }
  }
  const loc = (await remoteLocations(repoPath)).find((l) => github.toGithubRepo(l.host, l.path))
  const repo = loc && github.toGithubRepo(loc.host, loc.path)
  if (!repo) throw new Error("This repository's remote isn't on GitHub.")
  return {
    repo,
    rest: async (method, path, body) => {
      const out = await ghApi(
        repoPath,
        repo.host,
        ['--method', method, path],
        body !== undefined ? JSON.stringify(body) : undefined
      )
      return (out.trim() ? JSON.parse(out) : undefined) as never
    },
    graphql: async (query, variables) => {
      const out = JSON.parse(await ghApi(repoPath, repo.host, ['graphql'], JSON.stringify({ query, variables })))
      if (out.errors?.length && !out.data) throw new Error(out.errors.map((e: { message: string }) => e.message).join('; '))
      return out.data as never
    }
  }
}
