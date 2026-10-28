import { promises as fsp } from 'fs'
import { dirname, join } from 'path'
import type { ConflictSnapshot, RenameKeep } from '../../shared/types'
import { conflictHunks, parseConflictMarkers } from '../../shared/conflicts'
import { GitError, runGit } from '../gitExec'
import {
  DEFAULT_MARKER_SIZE,
  type StageEntry,
  blobBytes,
  conflictStages,
  findRenameConflict,
  markerSizeFor,
  mergeThreeWay,
  readThreeWay,
  runGitWithInput,
  stageEntries
} from './conflictFile'
import { getOperationState } from './operation'

// Resolving conflicted files: saving a resolution, taking a side, renames
// and deletes, marking resolved, and snapshots for Undo.

/**
 * Writes the resolved content and, unless `stage` is false (content that
 * still has conflict markers), stages it, marking the file resolved.
 */
export async function saveResolution(repoPath: string, path: string, content: string, stage = true): Promise<void> {
  await fsp.writeFile(join(repoPath, path), content)
  if (stage) await runGit(repoPath, ['add', '--', path])
}

/**
 * Resolves a file by taking one side, or the common ancestor. Taking a side
 * resolves every conflict to that side but keeps the other side's changes
 * that don't conflict, like "Take all" in the merge tool. A binary file is
 * taken whole. Taking a version that doesn't exist (the side that deleted
 * the file) deletes it.
 */
export async function takeSide(
  repoPath: string,
  path: string,
  side: 'current' | 'incoming' | 'base'
): Promise<void> {
  const stages = await conflictStages(repoPath, path)
  const stage = side === 'base' ? 1 : side === 'current' ? 2 : 3
  if (stages.size > 0 && !stages.has(stage)) {
    await runGit(repoPath, ['rm', '-q', '--', path])
    return
  }
  if (side === 'base') {
    await fsp.writeFile(join(repoPath, path), await blobBytes(repoPath, stages.get(1)!))
  } else {
    const texts =
      stages.has(2) && stages.has(3)
        ? await readThreeWay(repoPath, { base: stages.get(1), ours: stages.get(2)!, theirs: stages.get(3)! })
        : null
    if (texts) {
      const favor = side === 'current' ? 'ours' : 'theirs'
      await fsp.writeFile(join(repoPath, path), (await mergeThreeWay(repoPath, texts, { favor })).text)
    } else {
      await runGit(repoPath, ['checkout', side === 'current' ? '--ours' : '--theirs', '--', path])
    }
  }
  await runGit(repoPath, ['add', '--', path])
}

/** Takes `path` out of the index and the working tree, whatever its state. */
async function removePath(repoPath: string, path: string): Promise<void> {
  await runGit(repoPath, ['rm', '-q', '--cached', '--ignore-unmatch', '--', path])
  await fsp.rm(join(repoPath, path), { force: true })
}

/** The mode and blob of `path` in a commit, or undefined if it isn't there. */
async function treeEntry(repoPath: string, commit: string, path: string): Promise<StageEntry | undefined> {
  const out = await runGit(repoPath, ['ls-tree', '-z', commit, '--', path])
  const m = out.match(/^(\d+) blob ([0-9a-f]+)\t/)
  return m ? { mode: m[1], sha: m[2] } : undefined
}

/**
 * Resolves a rename conflict for all the names involved at once: keeps the
 * file under one side's name, under both, or deletes it. Keeping one name
 * merges in the other side's edits; if those conflict, the conflict moves to
 * the kept name for the merge tool.
 */
export async function resolveRename(repoPath: string, path: string, keep: RenameKeep): Promise<void> {
  const found = await findRenameConflict(repoPath, path)
  if (!found) throw new GitError(`"${path}" is not part of a rename conflict.`)
  const { rename, sides } = found
  const names = [...new Set([rename.from, rename.current, rename.incoming])].filter((n): n is string => n !== null)

  // Each side's own version, from its commit: for a rename/rename git leaves
  // its own attempt at merging the two (markers and all) in the index.
  const [base, current, incoming] = await Promise.all([
    treeEntry(repoPath, sides.base, rename.from),
    rename.current ? treeEntry(repoPath, 'HEAD', rename.current) : undefined,
    rename.incoming ? treeEntry(repoPath, sides.incoming, rename.incoming) : undefined
  ])

  const kept: { name: string; entry: StageEntry }[] = []
  if ((keep === 'current' || keep === 'both') && rename.current && current) kept.push({ name: rename.current, entry: current })
  if ((keep === 'incoming' || keep === 'both') && rename.incoming && incoming) kept.push({ name: rename.incoming, entry: incoming })
  if (keep !== 'none' && kept.length === 0) throw new GitError(`That side deleted "${rename.from}".`)

  // Keeping one name when both sides still have the file merges their edits.
  const texts =
    (keep === 'current' || keep === 'incoming') && current && incoming
      ? await readThreeWay(repoPath, { base: base?.sha, ours: current.sha, theirs: incoming.sha })
      : null
  const bytes = await Promise.all(kept.map(({ entry }) => blobBytes(repoPath, entry.sha)))

  for (const name of names) await removePath(repoPath, name)

  for (const [i, { name }] of kept.entries()) {
    const file = join(repoPath, name)
    await fsp.mkdir(dirname(file), { recursive: true })
    if (!texts) {
      await fsp.writeFile(file, bytes[i])
      await runGit(repoPath, ['add', '--', name])
      continue
    }
    const state = await getOperationState(repoPath)
    const markerSize = markerSizeFor([texts.base ?? '', texts.ours, texts.theirs])
    const merged = await mergeThreeWay(repoPath, texts, {
      markerSize,
      labels: [state?.currentLabel ?? 'current', state?.incomingLabel ?? 'incoming']
    })
    await fsp.writeFile(file, merged.text)
    if (merged.conflicts === 0) {
      await runGit(repoPath, ['add', '--', name])
    } else {
      // Record the three versions as index stages, so the kept name shows up
      // as an ordinary conflicted file.
      const entries = [base, current, incoming]
        .map((e, s) => (e ? `${e.mode} ${e.sha} ${s + 1}\t${name}\n` : ''))
        .join('')
      await runGitWithInput(repoPath, ['update-index', '--index-info'], entries)
    }
  }
}

/** Deletes a conflicted file and marks it resolved that way. */
export async function deleteConflictedFile(repoPath: string, path: string): Promise<void> {
  await runGit(repoPath, ['rm', '-q', '--force', '--', path])
}

/**
 * Marks files resolved as they are in the working tree (a missing file is
 * resolved as deleted). Returns how they were before, for Undo.
 */
export async function markResolved(repoPath: string, paths: string[]): Promise<ConflictSnapshot> {
  if (paths.length === 0) return { files: [] }
  const snapshot = await snapshotConflicts(repoPath, paths)
  await runGit(repoPath, ['add', '-A', '--', ...paths])
  return snapshot
}

/**
 * True when `text` still has conflict markers: ones of the default length, or
 * of `markerSize` when the file needed longer ones.
 */
export function hasConflictMarkers(text: string, markerSize = DEFAULT_MARKER_SIZE): boolean {
  const sizes = new Set([DEFAULT_MARKER_SIZE, markerSize])
  return [...sizes].some((size) => conflictHunks(parseConflictMarkers(text, size)).length > 0)
}

/** The paths, of those given, whose working-tree file still contains conflict markers. */
export async function pathsWithMarkers(repoPath: string, paths: string[]): Promise<string[]> {
  const found: string[] = []
  for (const path of paths) {
    const text = await fsp.readFile(join(repoPath, path), 'utf-8').catch(() => null)
    if (text === null || text.includes('\0')) continue
    const stages = await conflictStages(repoPath, path).catch(() => new Map<number, string>())
    const texts =
      stages.has(2) && stages.has(3)
        ? await readThreeWay(repoPath, { base: stages.get(1), ours: stages.get(2)!, theirs: stages.get(3)! }).catch(() => null)
        : null
    const markerSize = texts ? markerSizeFor([texts.base ?? '', texts.ours, texts.theirs]) : DEFAULT_MARKER_SIZE
    if (hasConflictMarkers(text, markerSize)) found.push(path)
  }
  return found
}

/** Records how `paths` look now (index stages and working-tree content) so a bulk action can be undone. */
export async function snapshotConflicts(repoPath: string, paths: string[]): Promise<ConflictSnapshot> {
  const files: ConflictSnapshot['files'] = []
  for (const path of paths) {
    const entries = await stageEntries(repoPath, path)
    const stages = [...entries].map(([stage, e]) => ({ stage, mode: e.mode, sha: e.sha }))
    const file = join(repoPath, path)
    const stat = await fsp.stat(file).catch(() => null)
    let worktree: ConflictSnapshot['files'][number]['worktree'] = null
    if (stat?.isFile()) {
      // -w keeps the content in the object store, so it can be read back later.
      const sha = (await runGit(repoPath, ['hash-object', '-w', '--no-filters', '--', path])).trim()
      worktree = { sha, executable: (stat.mode & 0o111) !== 0 }
    }
    files.push({ path, stages, worktree })
  }
  return { files }
}

/** Puts files back exactly as a snapshot recorded them: conflicted again, with their old content. */
export async function restoreConflicts(repoPath: string, snapshot: ConflictSnapshot): Promise<void> {
  for (const { path, stages, worktree } of snapshot.files) {
    // Mode 0 drops whatever entry the path has now; the stage lines put the conflict back.
    const lines = [`0 ${'0'.repeat(40)}\t${path}\n`, ...stages.map((s) => `${s.mode} ${s.sha} ${s.stage}\t${path}\n`)]
    await runGitWithInput(repoPath, ['update-index', '--index-info'], lines.join(''))
    const file = join(repoPath, path)
    if (worktree) {
      await fsp.mkdir(dirname(file), { recursive: true })
      await fsp.writeFile(file, await blobBytes(repoPath, worktree.sha))
      await fsp.chmod(file, worktree.executable ? 0o755 : 0o644)
    } else {
      await fsp.rm(file, { force: true })
    }
  }
}

/**
 * Takes one side for several files at once. All or nothing: if any file
 * fails, the ones already done are put back. Returns a snapshot of how the
 * files were before, for Undo.
 */
export async function takeSideMany(
  repoPath: string,
  paths: string[],
  side: 'current' | 'incoming'
): Promise<ConflictSnapshot> {
  const snapshot = await snapshotConflicts(repoPath, paths)
  try {
    for (const path of paths) await takeSide(repoPath, path, side)
  } catch (err) {
    await restoreConflicts(repoPath, snapshot).catch(() => {})
    throw err
  }
  return snapshot
}
