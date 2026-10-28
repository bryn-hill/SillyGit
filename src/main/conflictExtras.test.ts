import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FixtureRepo } from '../../e2e/support/fixtureRepo'
import * as scenario from '../../e2e/support/mergeScenarios'
import { numbered } from '../../e2e/support/mergeScenarios'
import { getStatus } from './git'
import { markResolved, mergeBranch, pathsWithMarkers, restoreConflicts, saveResolution, takeSideMany } from './conflicts'

// mergeTool.ts reads its settings from the Electron settings file; the tests pass them in instead.
vi.mock('./settings', () => ({ getMergeToolSettings: async () => ({ tool: 'none', customCommand: '' }) }))
const { openInMergeTool } = await import('./mergeTool')

// Bulk conflict actions (take a side for several files, mark resolved) with
// Undo, the conflict-marker check, and the external merge tool launcher.

let repo: FixtureRepo

beforeEach(() => {
  repo = new FixtureRepo()
  scenario.multiFileConflict(repo)
})

afterEach(() => {
  repo.remove()
})

const conflictedPaths = async (): Promise<string[]> => (await getStatus(repo.path)).conflicted.map((f) => f.path).sort()

async function startMerge(): Promise<void> {
  expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
  expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
}

describe('taking a side for several files', () => {
  it("takes incoming in each file and keeps main's non-conflicting change", async () => {
    await startMerge()
    await takeSideMany(repo.path, ['a.txt', 'b.txt'], 'incoming')
    expect(await conflictedPaths()).toEqual(['c.txt'])
    const expected = numbered(5)
      .replace('line 1\n', 'line 1 (main)\n')
      .replace('line 3\n', 'line 3 (feature)\n')
      .replace('line 5\n', 'line 5 (feature)\n')
    expect(repo.readFile('a.txt')).toBe(expected)
    expect(repo.readFile('b.txt')).toBe(expected)
  })

  it('undo puts the files back exactly, conflicts and hand edits included', async () => {
    await startMerge()
    // A half-finished resolution saved with markers still in it.
    await saveResolution(repo.path, 'a.txt', repo.readFile('a.txt').replace('line 1 (main)', 'line 1 (edited by hand)'), false)
    chmodSync(join(repo.path, 'b.txt'), 0o755)
    const before = { a: repo.readFile('a.txt'), b: repo.readFile('b.txt') }

    const snapshot = await takeSideMany(repo.path, ['a.txt', 'b.txt'], 'current')
    expect(await conflictedPaths()).toEqual(['c.txt'])

    await restoreConflicts(repo.path, snapshot)
    expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(repo.readFile('a.txt')).toBe(before.a)
    expect(repo.readFile('b.txt')).toBe(before.b)
    expect(repo.git('ls-files', '-u', '--', 'a.txt').trim().split('\n')).toHaveLength(3)
  })

  it('is all or nothing: a failure part way puts back the files already taken', async () => {
    await startMerge()
    const before = repo.readFile('a.txt')
    await expect(takeSideMany(repo.path, ['a.txt', 'missing/nope.txt'], 'incoming')).rejects.toThrow()
    expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(repo.readFile('a.txt')).toBe(before)
  })

  it('undoes a modify/delete take, bringing the deleted file back', async () => {
    repo.git('branch', '-D', 'feature')
    repo.addModifyDeleteBranch()
    expect(await mergeBranch(repo.path, 'feature')).toEqual({ conflicts: true })
    const snapshot = await takeSideMany(repo.path, ['doomed.txt'], 'incoming')
    expect(existsSync(join(repo.path, 'doomed.txt'))).toBe(false)
    await restoreConflicts(repo.path, snapshot)
    expect(repo.readFile('doomed.txt')).toBe('keep me, edited\n')
    expect((await conflictedPaths()).includes('doomed.txt')).toBe(true)
  })
})

describe('marking files resolved', () => {
  it('finds the files that still have conflict markers', async () => {
    await startMerge()
    await saveResolution(repo.path, 'b.txt', numbered(5), false)
    expect(await pathsWithMarkers(repo.path, ['a.txt', 'b.txt', 'c.txt'])).toEqual(['a.txt', 'c.txt'])
  })

  it('can be undone', async () => {
    await startMerge()
    const snapshot = await markResolved(repo.path, ['a.txt', 'b.txt'])
    expect(await conflictedPaths()).toEqual(['c.txt'])
    await restoreConflicts(repo.path, snapshot)
    expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })
})

describe('external merge tool', () => {
  /** A fake merge tool: a script that writes $LOCAL's content (or markers) to $MERGED. */
  function fakeTool(body: string): string {
    const script = join(repo.path, '.git', `fake-tool-${Math.random().toString(36).slice(2)}.sh`)
    writeFileSync(script, `#!/bin/sh\n${body}\n`)
    chmodSync(script, 0o755)
    return script
  }

  it('passes the three versions and stages the result when no markers are left', async () => {
    await startMerge()
    const tool = fakeTool('cat "$2" > "$4"; echo "$1" > "$4.args"')
    const result = await openInMergeTool(repo.path, 'a.txt', {
      tool: 'custom',
      customCommand: `${tool} $LOCAL $REMOTE $BASE $MERGED`
    })
    expect(result).toEqual({ resolved: true })
    expect(await conflictedPaths()).toEqual(['b.txt', 'c.txt'])
    expect(repo.readFile('a.txt')).toBe(numbered(5).replace('line 3\n', 'line 3 (feature)\n').replace('line 5\n', 'line 5 (feature)\n'))
    // The current side's temp file keeps the file's extension for syntax highlighting.
    expect(repo.readFile('a.txt.args')).toMatch(/a\.LOCAL\.txt\n$/)
  })

  it('leaves the file conflicted when the tool closes with markers still in it', async () => {
    await startMerge()
    const tool = fakeTool('true')
    const result = await openInMergeTool(repo.path, 'a.txt', { tool: 'custom', customCommand: `${tool} $MERGED` })
    expect(result.resolved).toBe(false)
    expect(result.reason).toMatch(/conflict markers/)
    expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it("doesn't mark resolved when the tool fails", async () => {
    await startMerge()
    const tool = fakeTool('cat "$1" > "$2"; exit 3')
    const result = await openInMergeTool(repo.path, 'a.txt', { tool: 'custom', customCommand: `${tool} $LOCAL $MERGED` })
    expect(result).toEqual({ resolved: false, reason: expect.stringMatching(/exited with code 3/) })
    expect(await conflictedPaths()).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  it('reports a tool that is not installed', async () => {
    await startMerge()
    await expect(
      openInMergeTool(repo.path, 'a.txt', { tool: 'custom', customCommand: 'definitely-not-a-merge-tool $MERGED' })
    ).rejects.toThrow('The configured merge tool was not found')
  })

  it('says when no tool is configured', async () => {
    await startMerge()
    await expect(openInMergeTool(repo.path, 'a.txt')).rejects.toThrow('There is no merge tool configured')
  })

  it('uses git mergetool with the tool from git config', async () => {
    await startMerge()
    const tool = fakeTool('cat "$1" > "$2"')
    repo.git('config', 'merge.tool', 'fake')
    repo.git('config', 'mergetool.fake.cmd', `${tool} "$LOCAL" "$MERGED"`)
    repo.git('config', 'mergetool.fake.trustExitCode', 'true')
    expect(await openInMergeTool(repo.path, 'b.txt', { tool: 'git', customCommand: '' })).toEqual({ resolved: true })
    expect(await conflictedPaths()).toEqual(['a.txt', 'c.txt'])
  })
})
