import { describe, expect, it } from 'vitest'
import * as scenario from '../../e2e/support/mergeScenarios'
import { numbered } from '../../e2e/support/mergeScenarios'
import { buildOutput, conflictHunks, toggleHunkSide, type ConflictPicks } from '../shared/conflicts'
import { continueOperation, getConflictFile, markResolved, mergeBranch, takeSide } from './conflicts'
import {
  conflictedPaths,
  parents,
  read,
  readBytes,
  repo,
  resolveWith,
  segmentsOf,
  takeAll,
  takeBoth,
  tree,
  useScenarioRepo
} from './conflicts.scenarios.support'

// Adds, deletes and paths, formatting, and big or many hunks. See
// conflicts.scenarios.support.ts.

useScenarioRepo()

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
    expect(await getConflictFile(repo.path, 'thing~HEAD')).toMatchObject({
      kind: 'deleted-incoming',
      folderInTheWay: { folder: 'thing', fileSide: 'current' }
    })
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
