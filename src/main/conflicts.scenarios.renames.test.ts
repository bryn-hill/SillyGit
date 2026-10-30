import { describe, expect, it } from 'vitest'
import * as scenario from '../../e2e/support/mergeScenarios'
import { numbered } from '../../e2e/support/mergeScenarios'
import { conflictHunks } from '../shared/conflicts'
import {
  continueOperation,
  deleteConflictedFile,
  getConflictFile,
  mergeBranch,
  rebaseOnto,
  resolveRename,
  takeSide
} from './conflicts'
import {
  conflictedPaths,
  read,
  repo,
  resolveWith,
  segmentsOf,
  takeAll,
  takeBoth,
  tree,
  useScenarioRepo
} from './conflicts.scenarios.support'
import { getStatus } from './git'

// Rename conflicts. See conflicts.scenarios.support.ts.

useScenarioRepo()

describe('renames', () => {
  it('rename/modify: the conflict is reported at the new name and the merge keeps the rename', async () => {
    scenario.renameModify(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    expect(await conflictedPaths()).toEqual(['salutation.txt'])

    const output = await resolveWith('salutation.txt', takeBoth)
    expect(output).toBe(numbered(10).replace('line 3\n', 'line 3 (main)\nline 3 (feature)\n'))
    await continueOperation(repo.path)
    expect(tree()).toContain('salutation.txt')
    expect(tree()).not.toContain('greeting.txt')
  })

  it('a staged rename shows the new and old paths in the status', async () => {
    scenario.renameModify(repo)
    await mergeBranch(repo.path, 'feature')
    await takeSide(repo.path, 'salutation.txt', 'current')
    const status = await getStatus(repo.path)
    expect(status.conflicted).toEqual([])
    expect(status.staged).toEqual([
      expect.objectContaining({ path: 'salutation.txt', origPath: 'greeting.txt', index: 'R' })
    ])
  })

  it('rename/rename: both new names and the old one are conflicted; keeping one name resolves it', async () => {
    scenario.renameRename(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    expect(await conflictedPaths()).toEqual(['ours.txt', 'shared.txt', 'theirs.txt'])

    // Each path exists on only one side, so the tool offers keep or delete.
    expect((await getConflictFile(repo.path, 'ours.txt')).kind).toBe('deleted-incoming')
    expect((await getConflictFile(repo.path, 'theirs.txt')).kind).toBe('deleted-current')
    expect((await getConflictFile(repo.path, 'shared.txt')).kind).toBe('deleted-current')

    await takeSide(repo.path, 'ours.txt', 'current')
    await takeSide(repo.path, 'theirs.txt', 'current') // deleted on current: removes it
    await deleteConflictedFile(repo.path, 'shared.txt')
    expect(await conflictedPaths()).toEqual([])
    await continueOperation(repo.path)
    expect(tree()).toEqual(['README.md', 'hello.txt', 'ours.txt'])
  })

  it('rename/rename: every name involved reports the same rename', async () => {
    scenario.renameRename(repo)
    await mergeBranch(repo.path, 'feature')
    const rename = { from: 'shared.txt', current: 'ours.txt', incoming: 'theirs.txt' }
    for (const path of ['ours.txt', 'theirs.txt', 'shared.txt']) {
      expect((await getConflictFile(repo.path, path)).rename).toEqual(rename)
    }
  })

  it.each([
    ['current', ['ours.txt']],
    ['incoming', ['theirs.txt']],
    ['both', ['ours.txt', 'theirs.txt']],
    ['none', []]
  ] as const)('rename/rename: keeping %s resolves all three names in one go', async (keep, names) => {
    scenario.renameRename(repo)
    await mergeBranch(repo.path, 'feature')
    await resolveRename(repo.path, 'theirs.txt', keep)
    expect(await conflictedPaths()).toEqual([])
    await continueOperation(repo.path)
    expect(tree()).toEqual(['README.md', 'hello.txt', ...names])
    for (const name of names) expect(read(name)).toBe(numbered(10))
  })

  it('rename/rename with edits: keeping one name merges both sides\' edits and moves the conflict there', async () => {
    scenario.renameRenameEdited(repo)
    await mergeBranch(repo.path, 'feature')
    expect(await conflictedPaths()).toEqual(['ours.txt', 'shared.txt', 'theirs.txt'])
    await resolveRename(repo.path, 'ours.txt', 'incoming')

    expect(await conflictedPaths()).toEqual(['theirs.txt'])
    const [hunk] = conflictHunks(await segmentsOf('theirs.txt'))
    expect(hunk).toMatchObject({ ours: ['line 3 (main)\n'], base: ['line 3\n'], theirs: ['line 3 (feature)\n'] })
    await resolveWith('theirs.txt', takeAll('theirs'))
    await continueOperation(repo.path)
    expect(tree()).toEqual(['README.md', 'hello.txt', 'theirs.txt'])
    expect(read('theirs.txt')).toBe(
      numbered(20)
        .replace('line 3\n', 'line 3 (feature)\n')
        .replace('line 7\n', 'line 7 (feature)\n')
        .replace('line 19\n', 'line 19 (main)\n')
    )
  })

  it('rename/rename during a rebase: current is the upstream, incoming the replayed commit', async () => {
    scenario.renameRename(repo)
    expect(await rebaseOnto(repo.path, 'feature')).toEqual({ conflicts: true })
    expect((await getConflictFile(repo.path, 'ours.txt')).rename).toEqual({
      from: 'shared.txt',
      current: 'theirs.txt',
      incoming: 'ours.txt'
    })
    await resolveRename(repo.path, 'ours.txt', 'incoming')
    expect(await continueOperation(repo.path)).toEqual({ conflicts: false })
    expect(tree()).toEqual(['README.md', 'hello.txt', 'ours.txt'])
  })

  it('rename/delete: reports the rename, and the file can be deleted', async () => {
    scenario.renameDelete(repo)
    await mergeBranch(repo.path, 'feature')
    expect((await getConflictFile(repo.path, 'kept.txt')).rename).toEqual({
      from: 'shared.txt',
      current: 'kept.txt',
      incoming: null
    })
    await expect(resolveRename(repo.path, 'kept.txt', 'incoming')).rejects.toThrow('deleted')
    await resolveRename(repo.path, 'kept.txt', 'none')
    await continueOperation(repo.path)
    expect(tree()).toEqual(['README.md', 'hello.txt'])
  })

  it('a plain modify/delete is not mistaken for a rename', async () => {
    repo.addModifyDeleteBranch()
    await mergeBranch(repo.path, 'feature')
    expect((await getConflictFile(repo.path, 'doomed.txt')).rename).toBeUndefined()
  })

  it('rename/delete: the renamed file can be kept', async () => {
    scenario.renameDelete(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    expect(await conflictedPaths()).toEqual(['kept.txt'])
    expect((await getConflictFile(repo.path, 'kept.txt')).kind).toBe('deleted-incoming')
    await takeSide(repo.path, 'kept.txt', 'current')
    await continueOperation(repo.path)
    expect(read('kept.txt')).toBe(numbered(10))
  })
})
