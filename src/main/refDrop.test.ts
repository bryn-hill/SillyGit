import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureRepo } from '../../e2e/support/fixtureRepo'
import { getOperationState } from './conflicts'
import { cherryPickOnto, dropRelation, fastForward, mergeInto, rebaseBranchOnto } from './refDrop'

let repo: FixtureRepo

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'Vitest',
    GIT_AUTHOR_EMAIL: 'vitest@example.com',
    GIT_COMMITTER_NAME: 'Vitest',
    GIT_COMMITTER_EMAIL: 'vitest@example.com'
  })
})

beforeEach(() => {
  repo = new FixtureRepo()
})

afterEach(() => {
  repo.remove()
})

const rev = (ref: string): string => repo.git('rev-parse', ref).trim()
const head = (): string => repo.git('symbolic-ref', '--short', 'HEAD').trim()
const subjects = (ref: string): string[] => repo.git('log', '--format=%s', ref).trim().split('\n')

/** `ahead` is main plus one commit, so main can fast-forward to it. */
function addAheadBranch(): void {
  repo.git('checkout', '-q', '-b', 'ahead')
  repo.commitFile('ahead.txt', 'ahead\n', 'Add ahead.txt')
  repo.git('checkout', '-q', 'main')
}

describe('dropRelation', () => {
  it('sees a branch that is ahead', async () => {
    addAheadBranch()
    const r = await dropRelation(repo.path, 'ahead', 'main')
    expect(r).toEqual({
      sourceHash: rev('ahead'),
      targetHash: rev('main'),
      targetContainsSource: false,
      sourceContainsTarget: true
    })
  })

  it('sees diverged branches and a commit already on the target', async () => {
    repo.addFeatureBranch()
    expect(await dropRelation(repo.path, 'feature', 'main')).toMatchObject({
      targetContainsSource: false,
      sourceContainsTarget: false
    })
    expect(await dropRelation(repo.path, 'main~1', 'feature')).toMatchObject({ targetContainsSource: true })
  })
})

describe('mergeInto', () => {
  it('checks out a branch that is not current and merges into it', async () => {
    repo.addFeatureBranch()
    repo.git('checkout', '-q', 'feature')
    expect(await mergeInto(repo.path, 'feature', 'main')).toEqual({ conflicts: false })
    expect(head()).toBe('main')
    expect(subjects('main')[0]).toBe("Merge branch 'feature'")
  })

  it('stops on conflicts so the conflict UI takes over', async () => {
    repo.addConflictingBranch()
    repo.git('checkout', '-q', 'feature')
    expect(await mergeInto(repo.path, 'feature', 'main')).toEqual({ conflicts: true })
    expect(head()).toBe('main')
    expect((await getOperationState(repo.path))?.kind).toBe('merge')
  })

  it('refuses to switch branches with uncommitted changes', async () => {
    repo.addFeatureBranch()
    repo.git('checkout', '-q', 'feature')
    repo.writeFile('hello.txt', 'edited\n')
    await expect(mergeInto(repo.path, 'feature', 'main')).rejects.toThrow(/Commit or stash your changes/)
    expect(head()).toBe('feature')
  })

  it('merges into the current branch even with unrelated changes', async () => {
    repo.addFeatureBranch()
    repo.writeFile('hello.txt', 'edited\n')
    expect(await mergeInto(repo.path, 'feature', 'main')).toEqual({ conflicts: false })
    expect(repo.readFile('hello.txt')).toBe('edited\n')
  })
})

describe('rebaseBranchOnto', () => {
  it('rebases a branch that is not checked out and leaves it checked out', async () => {
    repo.addFeatureBranch()
    expect(await rebaseBranchOnto(repo.path, 'feature', 'main')).toEqual({ conflicts: false })
    expect(head()).toBe('feature')
    expect(subjects('feature').slice(0, 2)).toEqual(['Add feature.txt on feature', 'Add main.txt'])
  })

  it('stops on conflicts', async () => {
    repo.addConflictingBranch()
    expect(await rebaseBranchOnto(repo.path, 'feature', 'main')).toEqual({ conflicts: true })
    expect((await getOperationState(repo.path))?.kind).toBe('rebase')
  })
})

describe('fastForward', () => {
  it('moves a branch that is not checked out without touching the working tree', async () => {
    addAheadBranch()
    repo.git('checkout', '-q', 'ahead')
    repo.git('checkout', '-q', '-b', 'other', 'main~1')
    repo.writeFile('hello.txt', 'dirty\n')
    await fastForward(repo.path, 'main', 'ahead')
    expect(rev('main')).toBe(rev('ahead'))
    expect(head()).toBe('other')
    expect(repo.readFile('hello.txt')).toBe('dirty\n')
  })

  it('fast-forwards the checked-out branch', async () => {
    addAheadBranch()
    await fastForward(repo.path, 'main', 'ahead')
    expect(rev('main')).toBe(rev('ahead'))
    expect(repo.readFile('ahead.txt')).toBe('ahead\n')
  })

  it('refuses when the branches have diverged', async () => {
    repo.addFeatureBranch()
    const before = rev('main')
    await expect(fastForward(repo.path, 'main', 'feature')).rejects.toThrow(/can't be fast-forwarded/)
    expect(rev('main')).toBe(before)
  })
})

describe('cherryPickOnto', () => {
  it('checks out the target and picks the commits in order', async () => {
    repo.addFeatureBranch()
    repo.git('checkout', '-q', 'feature')
    repo.commitFile('second.txt', '2\n', 'Second on feature')
    repo.git('checkout', '-q', 'main')
    const picks = [rev('feature~1'), rev('feature')]
    repo.git('checkout', '-q', '-b', 'elsewhere', 'main~1')

    expect(await cherryPickOnto(repo.path, picks, 'main')).toEqual({ conflicts: false })
    expect(head()).toBe('main')
    expect(subjects('main').slice(0, 3)).toEqual(['Second on feature', 'Add feature.txt on feature', 'Add main.txt'])
  })

  it('refuses while another operation is under way', async () => {
    repo.addConflictingBranch()
    await mergeInto(repo.path, 'feature', 'main')
    await expect(cherryPickOnto(repo.path, [rev('feature')], 'feature')).rejects.toThrow(/in progress/)
  })
})
