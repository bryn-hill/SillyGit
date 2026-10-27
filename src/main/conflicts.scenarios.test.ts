import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureRepo } from '../../e2e/support/fixtureRepo'
import * as scenario from '../../e2e/support/mergeScenarios'
import { numbered } from '../../e2e/support/mergeScenarios'
import {
  buildOutput,
  conflictHunks,
  parseConflictMarkers,
  setSideTaken,
  toggleHunkSide,
  type ConflictPicks,
  type ConflictSegment
} from '../shared/conflicts'
import {
  abortOperation,
  continueOperation,
  deleteConflictedFile,
  getConflictFile,
  getOperationState,
  markResolved,
  mergeBranch,
  rebaseOnto,
  runMayConflict,
  saveResolution,
  skipOperation,
  takeSide
} from './conflicts'
import { cherryPick, getGraphLog, getStatus, revertCommit } from './git'

// Real git repositories with hard merge situations (see
// e2e/support/mergeScenarios.ts), driven through the same functions the app
// calls over IPC, and resolved with the same pick/output logic the merge tool uses.

let repo: FixtureRepo

beforeAll(() => {
  // continueOperation commits through the app's own git calls.
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

const read = (path: string): string => repo.readFile(path)
const readBytes = (path: string): Buffer => readFileSync(join(repo.path, path))
const conflictedPaths = async (): Promise<string[]> => (await getStatus(repo.path)).conflicted.map((f) => f.path).sort()
const parents = (rev = 'HEAD'): string[] => repo.git('rev-list', '--parents', '-1', rev).trim().split(' ').slice(1)
const tree = (rev = 'HEAD'): string[] => repo.git('ls-tree', '-r', '--name-only', rev).trim().split('\n')

/** Reads a conflicted text file the way the merge tool does. */
async function segmentsOf(path: string): Promise<ConflictSegment[]> {
  const file = await getConflictFile(repo.path, path)
  expect(file.kind).toBe('text')
  return parseConflictMarkers(file.marked, file.markerSize)
}

/** Picks in the merge tool, then saves and stages the output like its Save button. */
async function resolveWith(path: string, pick: (segments: ConflictSegment[]) => ConflictPicks): Promise<string> {
  const segments = await segmentsOf(path)
  const output = buildOutput(segments, pick(segments))
  await saveResolution(repo.path, path, output)
  return output
}

const takeAll =
  (side: 'ours' | 'theirs') =>
  (segments: ConflictSegment[]): ConflictPicks =>
    setSideTaken(segments, {}, side, true)

/** Takes both sides of every hunk, ours first. */
const takeBoth = (segments: ConflictSegment[]): ConflictPicks =>
  setSideTaken(segments, setSideTaken(segments, {}, 'ours', true), 'theirs', true)

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

describe('adds, deletes and paths', () => {
  it('add/add: no base version, so the hunk has no base and shared lines stay outside it', async () => {
    scenario.addAdd(repo)
    await mergeBranch(repo.path, 'feature')
    const segments = await segmentsOf('new.txt')
    expect(segments).toEqual([
      { kind: 'common', lines: ['first\n'] },
      { kind: 'conflict', id: 0, ours: ['from main\n'], base: [], theirs: ['from feature\n'] },
      { kind: 'common', lines: ['last\n'] }
    ])
    // "Take base" of a file with no base deletes it.
    await takeSide(repo.path, 'new.txt', 'base')
    expect(repo.git('status', '--porcelain', '--', 'new.txt').trim()).toBe('D  new.txt')
  })

  it('directory/file: git moves our file aside to thing~HEAD and keeps the directory', async () => {
    scenario.directoryFile(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    expect(await conflictedPaths()).toEqual(['thing~HEAD'])
    expect((await getConflictFile(repo.path, 'thing~HEAD')).kind).toBe('deleted-incoming')
    await markResolved(repo.path, ['thing~HEAD'])
    await continueOperation(repo.path)
    expect(tree()).toEqual(expect.arrayContaining(['thing/inner.txt', 'thing~HEAD']))
  })

  it('handles non-ASCII paths and content', async () => {
    scenario.unicodeConflict(repo)
    await mergeBranch(repo.path, 'feature')
    expect(await conflictedPaths()).toEqual([scenario.UNICODE_PATH])
    const output = await resolveWith(scenario.UNICODE_PATH, takeBoth)
    expect(output).toBe('Grüße\n中文 · Ελληνικά · 🇳🇿\nשלום עולם · 👩‍💻 · é\n🙂 end\n')
    await continueOperation(repo.path)
    expect(read(scenario.UNICODE_PATH)).toBe(output)
  })

  it('handles paths with spaces and quotes', async () => {
    scenario.awkwardPathConflict(repo)
    await mergeBranch(repo.path, 'feature')
    expect(await conflictedPaths()).toEqual([scenario.AWKWARD_PATH])
    await resolveWith(scenario.AWKWARD_PATH, takeAll('ours'))
    expect(await conflictedPaths()).toEqual([])
    await continueOperation(repo.path)
    expect(read(scenario.AWKWARD_PATH)).toBe('a\nB (main)\nc\n')
  })

  it('binary files can only be taken whole, byte for byte', async () => {
    scenario.binaryConflict(repo)
    await mergeBranch(repo.path, 'feature')
    expect((await getConflictFile(repo.path, 'logo.png')).kind).toBe('binary')
    await takeSide(repo.path, 'logo.png', 'incoming')
    await continueOperation(repo.path)
    expect(repo.git('rev-parse', 'HEAD:logo.png')).toBe(repo.git('rev-parse', 'feature:logo.png'))
    expect(readBytes('logo.png')[12]).toBe(2)
  })
})

describe('formatting', () => {
  it('CRLF vs LF: each side keeps its own line endings in the hunk', async () => {
    scenario.lineEndings(repo)
    await mergeBranch(repo.path, 'feature')
    const [hunk] = conflictHunks(await segmentsOf('crlf.txt'))
    expect(hunk.ours).toEqual(numbered(4, '\r\n').match(/[^\n]*\n/g))
    expect(hunk.theirs).toContain('line 2 (feature)\n')
    expect(await resolveWith('crlf.txt', takeAll('theirs'))).toBe(numbered(4).replace('line 2\n', 'line 2 (feature)\n'))
  })

  it('CRLF on both sides: picked lines and common lines all keep CRLF', async () => {
    scenario.crlfBothSides(repo)
    await mergeBranch(repo.path, 'feature')
    const output = await resolveWith('dos.txt', takeBoth)
    expect(output).toBe(numbered(5, '\r\n').replace('line 3\r\n', 'line 3 (main)\r\nline 3 (feature)\r\n'))
    expect(output).not.toMatch(/[^\r]\n/)
  })

  it('whitespace-only changes still conflict, and the picked side keeps its exact whitespace', async () => {
    scenario.whitespaceOnly(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    const output = await resolveWith('code.js', takeAll('ours'))
    expect(output).toContain('\tif (name) {\n\t\treturn "hi " + name\n')
    expect(output).not.toContain('  ')
  })

  it('a missing final newline survives taking that side whole', async () => {
    scenario.trailingNewline(repo)
    await mergeBranch(repo.path, 'feature')
    await takeSide(repo.path, 'tail.txt', 'current')
    expect(read('tail.txt')).toBe('one\ntwo\nthree')
  })

  it('a missing final newline: picking lines takes the other side as is', async () => {
    scenario.trailingNewline(repo)
    await mergeBranch(repo.path, 'feature')
    expect(await resolveWith('tail.txt', takeAll('theirs'))).toBe('one\ntwo\nTHREE\n')
  })

  it('content lines that look like conflict markers are not mistaken for markers', async () => {
    scenario.markerLookalikes(repo)
    await mergeBranch(repo.path, 'feature')
    const hunks = conflictHunks(await segmentsOf('doc.rst'))
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toEqual(['Title (main)\n', '=======\n', '>>>>>>> quoted\n', '<<<<<<<\n'])
    expect(hunks[0].base).toEqual(['Title\n', '-----\n'])
    expect(hunks[0].theirs).toEqual(['Title (feature)\n', '||||||| not a marker\n'])
    expect(await resolveWith('doc.rst', takeAll('ours'))).toBe(repo.git('show', 'main:doc.rst'))
  })
})

describe('size and hunk layout', () => {
  it('a 5000-line hunk on each side', async () => {
    scenario.largeHunk(repo)
    await mergeBranch(repo.path, 'feature')
    const hunks = conflictHunks(await segmentsOf('big.txt'))
    expect(hunks).toHaveLength(1)
    expect(hunks[0].ours).toHaveLength(5000)
    expect(hunks[0].theirs).toHaveLength(5000)
    expect(await resolveWith('big.txt', takeAll('theirs'))).toBe(repo.git('show', 'feature:big.txt'))
  })

  it('hundreds of separate hunks, resolved by alternating sides', async () => {
    scenario.manyHunks(repo, 600, 3)
    await mergeBranch(repo.path, 'feature')
    const segments = await segmentsOf('many.txt')
    const hunks = conflictHunks(segments)
    expect(hunks).toHaveLength(200)
    let picks: ConflictPicks = {}
    for (const h of hunks) picks = toggleHunkSide(h, picks, h.id % 2 === 0 ? 'ours' : 'theirs')
    const output = buildOutput(segments, picks)
    const lines = output.split('\n')
    expect(lines[0]).toBe('line 1 (main)')
    expect(lines[3]).toBe('line 4 (feature)')
    expect(lines[597]).toBe('line 598 (feature)')
    expect(lines).toHaveLength(601)
  })

  it('neighbouring changed lines are one hunk; a line between them splits it', async () => {
    scenario.adjacentHunks(repo)
    await mergeBranch(repo.path, 'feature')
    const hunks = conflictHunks(await segmentsOf('adj.txt'))
    expect(hunks.map((h) => h.ours)).toEqual([['line 2 (main)\n', 'line 3 (main)\n'], ['line 5 (main)\n']])
  })

  it('many conflicted files of different kinds in one merge', async () => {
    scenario.kitchenSink(repo)
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    expect(await conflictedPaths()).toEqual(['added.txt', 'crlf.txt', 'doomed.txt', 'edit.txt', 'moved-feature.txt'])
    expect((await getConflictFile(repo.path, 'doomed.txt')).kind).toBe('deleted-incoming')
    await expect(continueOperation(repo.path)).rejects.toThrow('Resolve every conflicted file')

    await resolveWith('edit.txt', takeBoth)
    await resolveWith('crlf.txt', takeAll('theirs'))
    await resolveWith('moved-feature.txt', takeBoth)
    await resolveWith('added.txt', takeAll('ours'))
    await takeSide(repo.path, 'doomed.txt', 'current')
    await continueOperation(repo.path)

    expect(parents()).toHaveLength(2)
    expect(read('crlf.txt')).toBe(numbered(3, '\r\n').replace('line 2', 'line 2 (feature)'))
    expect(read('moved-feature.txt')).toBe(numbered(8).replace('line 1\n', 'line 1 (main)\nline 1 (feature)\n'))
    expect(tree()).not.toContain('moved.txt')
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
