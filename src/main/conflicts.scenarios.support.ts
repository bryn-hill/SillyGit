import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, expect } from 'vitest'
import { FixtureRepo } from '../../e2e/support/fixtureRepo'
import { buildOutput, parseConflictMarkers, setSideTaken, type ConflictPicks, type ConflictSegment } from '../shared/conflicts'
import { getConflictFile, saveResolution } from './conflicts'
import { getStatus } from './git'

// Shared by the conflicts.scenarios.*.test.ts files: real git repositories with
// hard merge situations (see e2e/support/mergeScenarios.ts), driven through the
// same functions the app calls over IPC, and resolved with the same pick/output
// logic the merge tool uses. The scenarios are split over several files so
// vitest runs them in parallel.

export let repo: FixtureRepo

/** Gives every test in the calling file a fresh FixtureRepo in `repo`. */
export function useScenarioRepo(): void {
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
}

export const read = (path: string): string => repo.readFile(path)
export const readBytes = (path: string): Buffer => readFileSync(join(repo.path, path))
export const conflictedPaths = async (): Promise<string[]> => (await getStatus(repo.path)).conflicted.map((f) => f.path).sort()
export const parents = (rev = 'HEAD'): string[] => repo.git('rev-list', '--parents', '-1', rev).trim().split(' ').slice(1)
export const tree = (rev = 'HEAD'): string[] => repo.git('ls-tree', '-r', '--name-only', rev).trim().split('\n')

/** Reads a conflicted text file the way the merge tool does. */
export async function segmentsOf(path: string): Promise<ConflictSegment[]> {
  const file = await getConflictFile(repo.path, path)
  expect(file.kind).toBe('text')
  return parseConflictMarkers(file.marked, file.markerSize)
}

/** Picks in the merge tool, then saves and stages the output like its Save button. */
export async function resolveWith(path: string, pick: (segments: ConflictSegment[]) => ConflictPicks): Promise<string> {
  const segments = await segmentsOf(path)
  const output = buildOutput(segments, pick(segments))
  await saveResolution(repo.path, path, output)
  return output
}

export const takeAll =
  (side: 'ours' | 'theirs') =>
  (segments: ConflictSegment[]): ConflictPicks =>
    setSideTaken(segments, {}, side, true)

/** Takes both sides of every hunk, ours first. */
export const takeBoth = (segments: ConflictSegment[]): ConflictPicks =>
  setSideTaken(segments, setSideTaken(segments, {}, 'ours', true), 'theirs', true)
