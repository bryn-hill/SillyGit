import { describe, expect, it } from 'vitest'
import * as scenario from '../../e2e/support/mergeScenarios'
import { numbered } from '../../e2e/support/mergeScenarios'
import { conflictHunks } from '../shared/conflicts'
import {
  abortOperation,
  continueOperation,
  getOperationState,
  mergeBranch,
  rebaseOnto,
  runMayConflict,
  skipOperation,
  takeSide
} from './conflicts'
import {
  conflictedPaths,
  parents,
  read,
  repo,
  resolveWith,
  segmentsOf,
  takeAll,
  takeBoth,
  tree,
  useScenarioRepo
} from './conflicts.scenarios.support'
import { cherryPick, getGraphLog, revertCommit } from './git'

// Octopus and criss-cross merges, taking a whole side, and rebase, cherry-pick
// and revert conflicts. See conflicts.scenarios.support.ts.

useScenarioRepo()

describe('octopus merges (3+ branches)', () => {
  it('merges three branches at once into a commit with four parents', async () => {
    scenario.octopusClean(repo)
    const result = await runMayConflict(repo.path, ['merge', '--no-edit', 'alpha', 'beta', 'gamma'])
    expect(result).toEqual({ conflicts: false })
    expect(parents()).toHaveLength(4)
    expect(tree()).toEqual(expect.arrayContaining(['alpha.txt', 'beta.txt', 'gamma.txt', 'main.txt']))
  })

  it('lists every parent of an octopus merge in the graph log', async () => {
    scenario.octopusHistory(repo)
    const graph = await getGraphLog(repo.path)
    const octopus = graph.find((c) => c.subject === 'Octopus merge')!
    expect(octopus.parents).toHaveLength(4)
    expect(graph.find((c) => c.subject === 'Merge delta')!.parents).toHaveLength(2)
  })

  it('a conflicting octopus stops with every incoming branch named, and commits with all of them as parents', async () => {
    scenario.octopusConflict(repo)
    const result = await runMayConflict(repo.path, ['merge', '--no-edit', 'alpha', 'beta', 'gamma'], { GIT_EDITOR: 'true' })
    expect(result).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({
      kind: 'merge',
      currentLabel: 'main',
      incomingLabel: 'alpha, beta and gamma'
    })
    expect(await conflictedPaths()).toEqual(['hello.txt'])
    // git merges the heads one after another, so "current" already holds beta's change.
    const [hunk] = conflictHunks(await segmentsOf('hello.txt'))
    expect(hunk).toMatchObject({ ours: ['beta\n'], theirs: ['gamma\n'] })

    await resolveWith('hello.txt', takeBoth)
    await continueOperation(repo.path)
    // main had nothing of its own, so git fast-forwarded it to alpha first.
    expect(parents()).toEqual(['alpha', 'beta', 'gamma'].map((b) => repo.git('rev-parse', b).trim()))
    expect(read('hello.txt')).toBe('hello\nbeta\ngamma\n')
    expect(tree()).toEqual(expect.arrayContaining(['alpha.txt', 'beta.txt', 'gamma.txt']))
  })

  it('aborting a conflicting octopus restores the branch', async () => {
    scenario.octopusConflict(repo)
    const before = repo.git('rev-parse', 'HEAD')
    await runMayConflict(repo.path, ['merge', '--no-edit', 'alpha', 'beta', 'gamma'])
    await abortOperation(repo.path)
    expect(await getOperationState(repo.path)).toBeNull()
    expect(repo.git('rev-parse', 'HEAD')).toBe(before)
    expect(repo.git('status', '--porcelain')).toBe('')
  })

  it('merging the octopus branches one by one stops on the real conflict', async () => {
    scenario.octopusConflict(repo)
    expect(await mergeBranch(repo.path, 'alpha')).toEqual({ conflicts: false })
    expect(await mergeBranch(repo.path, 'beta')).toEqual({ conflicts: false })
    expect(await mergeBranch(repo.path, 'gamma')).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({ kind: 'merge', currentLabel: 'main', incomingLabel: 'gamma' })
    expect(await resolveWith('hello.txt', takeBoth)).toBe('hello\nbeta\ngamma\n')
    await continueOperation(repo.path)
    expect(tree()).toEqual(expect.arrayContaining(['alpha.txt', 'beta.txt', 'gamma.txt']))
  })
})

describe('criss-cross merges (several merge bases)', () => {
  it('has two merge bases, and conflicts against a virtual base holding nested markers', async () => {
    scenario.crissCross(repo)
    expect(repo.git('merge-base', '--all', 'main', 'feature').trim().split('\n')).toHaveLength(2)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })

    const hunks = conflictHunks(await segmentsOf('story.txt'))
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toEqual(['line 2 (main B)\n'])
    expect(hunks[0].theirs).toEqual(['line 2 (feature B)\n'])
    // The base is git's merge of the two merge bases, which conflicted itself.
    expect(hunks[0].base.join('')).toContain('line 2 (main A)')
    expect(hunks[0].base.join('')).toContain('line 2 (feature A)')
  })

  it('resolves and commits the criss-cross merge', async () => {
    scenario.crissCross(repo)
    await mergeBranch(repo.path, 'feature')
    await resolveWith('story.txt', takeAll('theirs'))
    await continueOperation(repo.path)
    expect(read('story.txt')).toBe(numbered(6).replace('line 2\n', 'line 2 (feature B)\n'))
    expect(parents()).toHaveLength(2)
  })
})

describe('taking a whole side', () => {
  it.each([
    ['incoming', 'line 2 (feature)'],
    ['current', 'line 2 (main)']
  ] as const)('taking %s still keeps the changes that did not conflict', async (side, line2) => {
    scenario.partialConflict(repo)
    await mergeBranch(repo.path, 'feature')
    await takeSide(repo.path, 'part.txt', side)
    expect(await conflictedPaths()).toEqual([])
    expect(read('part.txt')).toBe(numbered(10).replace('line 2\n', `${line2}\n`).replace('line 8\n', 'line 8 (main)\n'))
  })

  it('in a rebase, taking incoming keeps upstream\'s other changes, so a later commit still conflicts', async () => {
    scenario.rebaseStack(repo)
    await rebaseOnto(repo.path, 'main')
    await takeSide(repo.path, 'list.txt', 'incoming')
    expect(read('list.txt')).toContain('line 8 (main)')
    expect(await continueOperation(repo.path)).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({ step: 3, total: 3 })
  })
})

describe('rebase, cherry-pick and revert', () => {
  it('a rebase that stops twice reports its step, and continues to the end', async () => {
    scenario.rebaseStack(repo)
    expect(await rebaseOnto(repo.path, 'main')).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({ kind: 'rebase', rebaseBranch: 'topic', step: 1, total: 3 })
    expect((await getOperationState(repo.path))!.incomingLabel).toMatch(/^topic: [0-9a-f]{7} Topic 1$/)

    await resolveWith('list.txt', takeAll('theirs'))
    expect(await continueOperation(repo.path)).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({ kind: 'rebase', step: 3, total: 3 })

    // During a rebase "current" is the upstream plus already replayed commits.
    const [hunk] = conflictHunks(await segmentsOf('list.txt'))
    expect(hunk.ours.join('')).toContain('line 8 (main)')
    await resolveWith('list.txt', takeAll('theirs'))
    expect(await continueOperation(repo.path)).toEqual({ conflicts: false })

    expect(await getOperationState(repo.path)).toBeNull()
    expect(repo.git('log', '--format=%s', '-4').trim().split('\n')).toEqual([
      'Topic 3',
      'Topic 2',
      'Topic 1',
      'Main edits list'
    ])
  })

  it('skipping a conflicting rebase step drops that commit', async () => {
    scenario.rebaseStack(repo)
    await rebaseOnto(repo.path, 'main')
    expect(await skipOperation(repo.path)).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({ step: 3 })
    await skipOperation(repo.path)
    expect(repo.git('log', '--format=%s', '-2').trim().split('\n')).toEqual(['Topic 2', 'Main edits list'])
  })

  it('aborting a rebase midway restores the branch', async () => {
    scenario.rebaseStack(repo)
    const before = repo.git('rev-parse', 'topic')
    await rebaseOnto(repo.path, 'main')
    await resolveWith('list.txt', takeAll('theirs'))
    await continueOperation(repo.path)
    await abortOperation(repo.path)
    expect(await getOperationState(repo.path)).toBeNull()
    expect(repo.git('rev-parse', 'HEAD')).toBe(before)
  })

  it('cherry-pick conflict: resolve and commit with a new message, keeping the author', async () => {
    const hash = scenario.cherryPickConflict(repo)
    expect(await cherryPick(repo.path, hash)).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({
      kind: 'cherry-pick',
      currentLabel: 'main',
      incomingLabel: `${hash.slice(0, 7)} Pick me`
    })
    await resolveWith('pick.txt', takeBoth)
    await continueOperation(repo.path, 'Picked by hand')
    expect(repo.git('log', '-1', '--format=%s|%an').trim()).toBe('Picked by hand|E2E Tester')
    expect(read('pick.txt')).toBe(numbered(4).replace('line 2\n', 'line 2 (main)\nline 2 (picked)\n'))
  })

  it('revert conflict: labels the incoming side as the revert', async () => {
    const hash = scenario.revertConflict(repo)
    expect(await revertCommit(repo.path, hash)).toEqual({ conflicts: true })
    expect(await getOperationState(repo.path)).toMatchObject({
      kind: 'revert',
      incomingLabel: `revert of ${hash.slice(0, 7)} Line 2 v2`
    })
    const [hunk] = conflictHunks(await segmentsOf('rev.txt'))
    expect(hunk).toMatchObject({ ours: ['line 2 v3\n'], base: ['line 2 v2\n'], theirs: ['line 2\n'] })
    await resolveWith('rev.txt', takeAll('theirs'))
    await continueOperation(repo.path)
    expect(read('rev.txt')).toBe(numbered(4))
  })
})
