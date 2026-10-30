import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GithubAccess } from './hosting'

// A signed-in account for the repo; the GitHub API itself is a fake fetch.
const fake = vi.hoisted(() => ({ access: null as GithubAccess | null }))

vi.mock('./hosting', () => ({
  githubAccess: async () => fake.access,
  azureAccess: async () => null,
  remoteLocations: async () => []
}))

import { setFetch } from './http'
import { createPullRequest, pushBranch, suggestedReviewers } from './createPullRequest'
import type { CreatePullRequestInput } from '../shared/createPullRequest'

interface Call {
  url: string
  method: string
  body: unknown
}

let calls: Call[] = []
let respond: (call: Call) => { status?: number; json: unknown } = () => ({ json: {} })

beforeEach(() => {
  calls = []
  respond = () => ({ json: {} })
  fake.access = {
    repo: { host: 'github.com', owner: 'bryn', name: 'app' },
    creds: { provider: 'github', host: 'github.com', token: 't0ken' },
    account: {
      id: 'a1',
      provider: 'github',
      host: 'github.com',
      username: 'bryn',
      displayName: 'Bryn',
      avatar: null,
      emails: [],
      addedAt: '2026-10-01T00:00:00Z'
    }
  }
  setFetch(async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    }
    calls.push(call)
    const { status = 200, json } = respond(call)
    return new Response(JSON.stringify(json), { status, statusText: status === 200 ? 'OK' : 'Error' })
  })
})

const input: CreatePullRequestInput = {
  base: 'main',
  head: 'feature/login',
  title: '  Add login page ',
  body: 'Adds the page.',
  draft: true,
  reviewers: []
}

const created = { number: 12, html_url: 'https://github.com/bryn/app/pull/12', title: 'Add login page' }

describe('createPullRequest', () => {
  it('opens the pull request with the account token', async () => {
    respond = () => ({ status: 201, json: created })
    const pr = await createPullRequest('/repo', input)
    expect(pr).toEqual({ number: 12, url: 'https://github.com/bryn/app/pull/12', title: 'Add login page' })
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/repos/bryn/app/pulls',
        method: 'POST',
        body: { title: 'Add login page', body: 'Adds the page.', head: 'feature/login', base: 'main', draft: true }
      }
    ])
  })

  it('asks the reviewers once the pull request is open', async () => {
    respond = () => ({ status: 201, json: created })
    await createPullRequest('/repo', { ...input, reviewers: ['alice', 'bob'] })
    expect(calls[1]).toEqual({
      url: 'https://api.github.com/repos/bryn/app/pulls/12/requested_reviewers',
      method: 'POST',
      body: { reviewers: ['alice', 'bob'] }
    })
  })

  it("keeps the pull request when asking for reviews fails, and says why", async () => {
    respond = (call) =>
      call.url.endsWith('/requested_reviewers')
        ? { status: 422, json: { message: 'Reviews may only be requested from collaborators.' } }
        : { status: 201, json: created }
    const pr = await createPullRequest('/repo', { ...input, reviewers: ['stranger'] })
    expect(pr.number).toBe(12)
    expect(pr.reviewersError).toMatch(/^Couldn't ask stranger for a review: 422 .*only be requested from collaborators/)
  })

  it.each([
    ['A pull request already exists for bryn:feature/login.', "There's already an open pull request from feature/login into main."],
    ['No commits between main and feature/login', "feature/login has no commits that aren't on main yet"],
    ['Validation Failed: head invalid', "GitHub can't find feature/login on the remote. Push it first."]
  ])('explains GitHub refusing with "%s"', async (message, explained) => {
    respond = () => ({ status: 422, json: { message } })
    await expect(createPullRequest('/repo', input)).rejects.toThrow(explained)
  })

  it('says to add the token again when GitHub rejects it', async () => {
    respond = () => ({ status: 401, json: { message: 'Bad credentials' } })
    await expect(createPullRequest('/repo', input)).rejects.toThrow('github.com rejected the token for bryn')
  })
})

describe('suggestedReviewers', () => {
  it('lists assignable users but not whoever is signed in', async () => {
    respond = (call) =>
      call.url.endsWith('/user')
        ? { json: { login: 'bryn' } }
        : { json: [{ login: 'alice' }, { login: 'bryn' }, { login: 'carol' }] }
    expect(await suggestedReviewers('/repo')).toEqual(['alice', 'carol'])
    expect(calls.map((c) => c.url)).toContain('https://api.github.com/repos/bryn/app/assignees?per_page=100')
  })
})

describe('pushBranch', () => {
  let dir: string
  let remoteDir: string
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sillygit-create-pr-'))
    remoteDir = mkdtempSync(join(tmpdir(), 'sillygit-create-pr-remote-'))
    git(remoteDir, 'init', '-q', '--bare', '-b', 'main')
    git(dir, 'init', '-q', '-b', 'main')
    git(dir, 'config', 'user.name', 'Ada Lovelace')
    git(dir, 'config', 'user.email', 'ada@example.com')
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    git(dir, 'add', 'a.txt')
    git(dir, 'commit', '-q', '-m', 'First')
    git(dir, 'remote', 'add', 'origin', remoteDir)
    git(dir, 'push', '-q', '-u', 'origin', 'main')
    git(dir, 'branch', 'feature/login')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(remoteDir, { recursive: true, force: true })
  })

  it('publishes a branch that is not checked out and tracks it', async () => {
    expect(await pushBranch(dir, 'feature/login', 'origin')).toBe('feature/login')
    expect(git(remoteDir, 'rev-parse', 'feature/login')).toBe(git(dir, 'rev-parse', 'feature/login'))
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'feature/login@{upstream}')).toBe('origin/feature/login')
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('pushes to the branch it already tracks, even under another name', async () => {
    git(dir, 'push', '-q', 'origin', 'feature/login:login')
    git(dir, 'branch', '-q', '--set-upstream-to=origin/login', 'feature/login')
    git(dir, 'checkout', '-q', 'feature/login')
    writeFileSync(join(dir, 'b.txt'), 'b\n')
    git(dir, 'add', 'b.txt')
    git(dir, 'commit', '-q', '-m', 'Second')

    expect(await pushBranch(dir, 'feature/login', 'origin')).toBe('login')
    expect(git(remoteDir, 'rev-parse', 'login')).toBe(git(dir, 'rev-parse', 'HEAD'))
  })
})
