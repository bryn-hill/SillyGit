import { execFile, spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type {
  ConflictFileContent,
  ConflictableResult,
  OperationState,
  RenameConflict,
  RenameKeep
} from '../shared/types'
import { GitError, runGit } from './gitExec'

// Merge, rebase, cherry-pick and revert can all stop part way with conflicts.
// This module reads that in-progress state from the git directory, and drives
// the resolver: reading each side of a conflicted file, saving a resolution,
// and aborting, continuing or skipping the operation.

async function gitDir(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim()
}

async function exists(path: string): Promise<boolean> {
  return fsp
    .access(path)
    .then(() => true)
    .catch(() => false)
}

async function readTrimmed(path: string): Promise<string | null> {
  return fsp
    .readFile(path, 'utf-8')
    .then((s) => s.trim())
    .catch(() => null)
}

async function currentBranch(repoPath: string): Promise<string> {
  const out = await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')
  return out.trim() || 'HEAD'
}

/** "abc1234 Subject" for a commit, or just the short hash if it can't be read. */
async function describeCommit(repoPath: string, rev: string): Promise<string> {
  const out = await runGit(repoPath, ['log', '-1', '--format=%h %s', rev]).catch(() => '')
  return out.trim() || rev.slice(0, 7)
}

/** A branch pointing at `rev`, else its short hash. */
async function branchAt(repoPath: string, rev: string): Promise<string> {
  const out = await runGit(repoPath, ['branch', '--points-at', rev, '--format=%(refname:short)']).catch(() => '')
  const name = out
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('('))
  return name ?? rev.slice(0, 7)
}

function cleanMessage(raw: string | null): string | undefined {
  if (!raw) return undefined
  const text = raw
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim()
  return text || undefined
}

/**
 * The branches named by git's merge message: "feature" from "Merge branch
 * 'feature'", or "alpha, beta and gamma" from an octopus merge's "Merge
 * branches 'alpha', 'beta' and 'gamma'".
 */
function mergedBranchesLabel(message: string | undefined): string | undefined {
  const names = message?.match(/^Merge (?:remote-tracking )?branch(?:es)? ('[^']+'(?:(?:, | and )'[^']+')*)/)?.[1]
  return names?.replace(/'([^']+)'/g, '$1')
}

export async function getOperationState(repoPath: string): Promise<OperationState | null> {
  const dir = await gitDir(repoPath)

  for (const name of ['rebase-merge', 'rebase-apply']) {
    const rebaseDir = join(dir, name)
    if (!(await exists(rebaseDir))) continue
    // rebase-apply is also used by `git am`, which has no head-name.
    const headName = await readTrimmed(join(rebaseDir, 'head-name'))
    if (headName === null) continue
    const onto = await readTrimmed(join(rebaseDir, 'onto'))
    const [stepFile, totalFile] = name === 'rebase-merge' ? ['msgnum', 'end'] : ['next', 'last']
    const step = Number(await readTrimmed(join(rebaseDir, stepFile))) || undefined
    const total = Number(await readTrimmed(join(rebaseDir, totalFile))) || undefined
    const branch = headName.replace(/^refs\/heads\//, '')
    const replaying = (await exists(join(dir, 'REBASE_HEAD')))
      ? await describeCommit(repoPath, 'REBASE_HEAD')
      : null
    return {
      kind: 'rebase',
      currentLabel: onto ? await branchAt(repoPath, onto) : 'upstream',
      incomingLabel: replaying ? `${branch}: ${replaying}` : branch,
      rebaseBranch: branch,
      step,
      total
    }
  }

  const message = cleanMessage(await readTrimmed(join(dir, 'MERGE_MSG')))

  const mergeHead = await readTrimmed(join(dir, 'MERGE_HEAD'))
  if (mergeHead) {
    return {
      kind: 'merge',
      currentLabel: await currentBranch(repoPath),
      incomingLabel: mergedBranchesLabel(message) ?? (await branchAt(repoPath, mergeHead.split('\n')[0])),
      message
    }
  }

  for (const [file, kind] of [
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert']
  ] as const) {
    if (!(await exists(join(dir, file)))) continue
    const commit = await describeCommit(repoPath, file)
    return {
      kind,
      currentLabel: await currentBranch(repoPath),
      incomingLabel: kind === 'revert' ? `revert of ${commit}` : commit,
      message
    }
  }

  return null
}

async function hasUnmergedPaths(repoPath: string): Promise<boolean> {
  const out = await runGit(repoPath, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')
  return out.trim().length > 0
}

/**
 * Runs a git command that may stop on conflicts. Stopping on conflicts is a
 * normal outcome here, not an error: the app shows the conflict UI instead.
 */
export async function runMayConflict(
  repoPath: string,
  args: string[],
  env?: Record<string, string>
): Promise<ConflictableResult> {
  try {
    await runGit(repoPath, args, env)
    return { conflicts: false }
  } catch (err) {
    if ((await getOperationState(repoPath)) && (await hasUnmergedPaths(repoPath))) {
      return { conflicts: true }
    }
    throw err
  }
}

// Keep git from opening an editor for commit messages it would ask about.
const NO_EDITOR = { GIT_EDITOR: 'true' }

export async function mergeBranch(repoPath: string, branch: string): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['merge', '--no-edit', branch], NO_EDITOR)
}

export async function rebaseOnto(repoPath: string, branch: string): Promise<ConflictableResult> {
  return runMayConflict(repoPath, ['rebase', branch], NO_EDITOR)
}

async function requireState(repoPath: string): Promise<OperationState> {
  const state = await getOperationState(repoPath)
  if (!state) throw new GitError('No merge, rebase, cherry-pick or revert is in progress.')
  return state
}

/**
 * Finishes the stopped operation once its conflicts are resolved: commits the
 * merge (or cherry-pick / revert) with `message`, or continues the rebase,
 * which may stop again on the next commit's conflicts.
 */
export async function continueOperation(repoPath: string, message?: string): Promise<ConflictableResult> {
  const state = await requireState(repoPath)
  if (await hasUnmergedPaths(repoPath)) {
    throw new GitError('Resolve every conflicted file before continuing.')
  }
  if (state.kind === 'rebase') {
    return runMayConflict(repoPath, ['rebase', '--continue'], NO_EDITOR)
  }
  // A plain commit concludes a merge, cherry-pick or revert, and keeps the
  // picked commit's author.
  const args = message?.trim() ? ['commit', '-m', message.trim()] : ['commit', '--no-edit']
  await runGit(repoPath, args, NO_EDITOR)
  return { conflicts: false }
}

export async function abortOperation(repoPath: string): Promise<void> {
  const state = await requireState(repoPath)
  await runGit(repoPath, [state.kind, '--abort'])
}

/** Skips the commit being applied (rebase, cherry-pick or revert). */
export async function skipOperation(repoPath: string): Promise<ConflictableResult> {
  const state = await requireState(repoPath)
  if (state.kind === 'merge') throw new GitError('A merge cannot skip; abort it instead.')
  return runMayConflict(repoPath, [state.kind, '--skip'], NO_EDITOR)
}

interface StageEntry {
  mode: string
  sha: string
}

/** The index stages of a conflicted path: 1 base, 2 current (ours), 3 incoming (theirs). */
async function stageEntries(repoPath: string, path: string): Promise<Map<number, StageEntry>> {
  const out = await runGit(repoPath, ['ls-files', '-u', '-z', '--', path])
  const stages = new Map<number, StageEntry>()
  for (const entry of out.split('\0')) {
    const m = entry.match(/^(\d+) ([0-9a-f]+) (\d)\t(.*)$/s)
    // ls-files matches directory prefixes too; keep only this exact path.
    if (m && m[4] === path) stages.set(Number(m[3]), { mode: m[1], sha: m[2] })
  }
  return stages
}

/** Blob ids of the index stages of a conflicted path. */
async function conflictStages(repoPath: string, path: string): Promise<Map<number, string>> {
  const entries = await stageEntries(repoPath, path)
  return new Map([...entries].map(([stage, e]) => [stage, e.sha]))
}

/** A blob's exact bytes (runGit decodes output as text). */
function blobBytes(repoPath: string, sha: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['cat-file', 'blob', sha],
      { cwd: repoPath, encoding: 'buffer', maxBuffer: 1024 * 1024 * 256 },
      (err, stdout, stderr) => (err ? reject(new GitError(stderr.toString().trim() || String(err))) : resolve(stdout))
    )
  })
}

/** Runs git with `input` on stdin. */
function runGitWithInput(repoPath: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoPath })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new GitError(stderr.trim() || `git exited ${code}`))))
    child.stdin.end(input)
  })
}

/** Runs `git merge-file`, whose exit code is the number of conflicts, not an error. */
function mergeFile(repoPath: string, args: string[]): Promise<{ text: string; conflicts: number }> {
  return new Promise((resolve, reject) => {
    execFile('git', ['merge-file', ...args], { cwd: repoPath, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      const code = err ? (err as { code?: number | string }).code : 0
      if (typeof code === 'number' && code >= 0 && code < 128) resolve({ text: stdout, conflicts: code })
      else reject(new GitError(stderr?.trim() || String(err)))
    })
  })
}

const DEFAULT_MARKER_SIZE = 7

/**
 * The conflict marker length to use for these texts: the default, or one
 * longer than any run of marker characters that starts a line in them (a
 * Markdown or reStructuredText heading underline, say), so content can never
 * be read as a marker.
 */
export function markerSizeFor(texts: string[]): number {
  let size = DEFAULT_MARKER_SIZE
  for (const text of texts) {
    for (const m of text.matchAll(/^(<+|=+|>+|\|+)/gm)) size = Math.max(size, m[1].length + 1)
  }
  return size
}

interface ThreeWay {
  base: string | null
  ours: string
  theirs: string
}

/** The three texts of a conflict, or null when any of them is binary. */
async function readThreeWay(
  repoPath: string,
  shas: { base?: string; ours: string; theirs: string }
): Promise<ThreeWay | null> {
  const read = (sha?: string): Promise<string | null> =>
    sha ? runGit(repoPath, ['cat-file', 'blob', sha]) : Promise.resolve(null)
  const [base, ours, theirs] = await Promise.all([read(shas.base), read(shas.ours), read(shas.theirs)])
  if ([base, ours, theirs].some((s) => s?.includes('\0'))) return null
  return { base, ours: ours!, theirs: theirs! }
}

/**
 * Three-way merges the texts with `git merge-file`. `favor` resolves every
 * conflict to one side, keeping the other side's changes that don't conflict.
 */
async function mergeThreeWay(
  repoPath: string,
  texts: ThreeWay,
  options: { favor?: 'ours' | 'theirs'; markerSize?: number; labels?: [string, string] } = {}
): Promise<{ text: string; conflicts: number }> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'sillygit-merge-'))
  try {
    const files = { ours: join(dir, 'ours'), base: join(dir, 'base'), theirs: join(dir, 'theirs') }
    await Promise.all([
      fsp.writeFile(files.ours, texts.ours),
      fsp.writeFile(files.base, texts.base ?? ''),
      fsp.writeFile(files.theirs, texts.theirs)
    ])
    const [currentLabel, incomingLabel] = options.labels ?? ['current', 'incoming']
    return await mergeFile(repoPath, [
      '-p',
      // With no common ancestor (both sides added the file) there is no base
      // to show, and leaving out --diff3 lets git trim the lines both sides share.
      ...(texts.base !== null ? ['--diff3'] : []),
      ...(options.favor ? [`--${options.favor}`] : []),
      `--marker-size=${options.markerSize ?? DEFAULT_MARKER_SIZE}`,
      '-L',
      currentLabel,
      '-L',
      'base',
      '-L',
      incomingLabel,
      files.ours,
      files.base,
      files.theirs
    ])
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** The commits the operation's base and incoming side come from, or null if there isn't one pair. */
async function operationSides(
  repoPath: string,
  state: OperationState
): Promise<{ base: string; incoming: string } | null> {
  const rev = (r: string): Promise<string | null> =>
    runGit(repoPath, ['rev-parse', '-q', '--verify', `${r}^{commit}`])
      .then((s) => s.trim() || null)
      .catch(() => null)
  const pair = async (base: string, incoming: string): Promise<{ base: string; incoming: string } | null> => {
    const [b, i] = await Promise.all([rev(base), rev(incoming)])
    return b && i ? { base: b, incoming: i } : null
  }
  switch (state.kind) {
    case 'merge': {
      const heads = ((await readTrimmed(join(await gitDir(repoPath), 'MERGE_HEAD'))) ?? '').split('\n')
      // An octopus has no single incoming side to compare against.
      if (heads.length !== 1 || !heads[0]) return null
      const base = await runGit(repoPath, ['merge-base', 'HEAD', heads[0]]).catch(() => '')
      return base.trim() ? pair(base.trim(), heads[0]) : null
    }
    case 'rebase':
      return pair('REBASE_HEAD^', 'REBASE_HEAD')
    case 'cherry-pick':
      return pair('CHERRY_PICK_HEAD^', 'CHERRY_PICK_HEAD')
    case 'revert':
      // A revert applies the commit backwards: from the commit to its parent.
      return pair('REVERT_HEAD', 'REVERT_HEAD^')
  }
}

interface SideChanges {
  renamed: Map<string, string>
  deleted: Set<string>
}

/** Files renamed (old -> new) and deleted between two commits. */
async function renamesAndDeletes(repoPath: string, from: string, to: string): Promise<SideChanges> {
  const out = await runGit(repoPath, ['diff', '--name-status', '-z', '-M', '--diff-filter=RD', from, to])
  const fields = out.split('\0')
  const changes: SideChanges = { renamed: new Map(), deleted: new Set() }
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i]
    if (status.startsWith('R')) {
      changes.renamed.set(fields[i + 1], fields[i + 2])
      i += 2
    } else if (status === 'D') {
      changes.deleted.add(fields[++i])
    }
  }
  return changes
}

/**
 * Works out whether a path conflicts because of a rename: one side renamed
 * the file and the other renamed it differently or deleted it. `path` may be
 * any of the names involved. Also returns the commits the sides come from.
 */
async function findRenameConflict(
  repoPath: string,
  path: string
): Promise<{ rename: RenameConflict; sides: { base: string; incoming: string } } | null> {
  const state = await getOperationState(repoPath)
  const sides = state && (await operationSides(repoPath, state))
  if (!sides) return null
  const [current, incoming] = await Promise.all([
    renamesAndDeletes(repoPath, sides.base, 'HEAD'),
    renamesAndDeletes(repoPath, sides.base, sides.incoming)
  ])
  const nameOn = (side: SideChanges, from: string): string | null =>
    side.renamed.get(from) ?? (side.deleted.has(from) ? null : from)
  const candidates = new Set([path])
  for (const side of [current, incoming]) {
    for (const [from, to] of side.renamed) if (to === path) candidates.add(from)
  }
  for (const from of candidates) {
    const rename = { from, current: nameOn(current, from), incoming: nameOn(incoming, from) }
    const renamedSomewhere = [rename.current, rename.incoming].some((n) => n !== null && n !== from)
    const names = [rename.from, rename.current, rename.incoming]
    if (renamedSomewhere && rename.current !== rename.incoming && names.includes(path)) return { rename, sides }
  }
  return null
}

/**
 * For "thing~HEAD" (git's name for a file it moved aside because the other
 * side added a folder "thing"), the folder's name.
 */
async function folderInTheWay(repoPath: string, path: string): Promise<string | null> {
  const tilde = path.lastIndexOf('~')
  if (tilde <= 0) return null
  const folder = path.slice(0, tilde)
  const inside = await runGit(repoPath, ['ls-files', '-z', '--', `${folder}/`]).catch(() => '')
  return inside.length > 0 ? folder : null
}

export async function getConflictFile(repoPath: string, path: string): Promise<ConflictFileContent> {
  const state = await getOperationState(repoPath)
  const currentLabel = state?.currentLabel ?? 'Current'
  const incomingLabel = state?.incomingLabel ?? 'Incoming'
  const base: ConflictFileContent = { path, kind: 'text', marked: '', currentLabel, incomingLabel }

  const stages = await conflictStages(repoPath, path)
  if (stages.size === 0) throw new GitError(`"${path}" has no conflicts.`)
  if (!stages.has(2) || !stages.has(3)) {
    const kind = stages.has(2) ? 'deleted-incoming' : 'deleted-current'
    const folder = await folderInTheWay(repoPath, path)
    if (folder) return { ...base, kind, folderInTheWay: { folder, fileSide: stages.has(2) ? 'current' : 'incoming' } }
    const found = await findRenameConflict(repoPath, path)
    return found ? { ...base, kind, rename: found.rename } : { ...base, kind }
  }

  const texts = await readThreeWay(repoPath, { base: stages.get(1), ours: stages.get(2)!, theirs: stages.get(3)! })
  if (!texts) return { ...base, kind: 'binary' }
  const markerSize = markerSizeFor([texts.base ?? '', texts.ours, texts.theirs])
  const { text: marked } = await mergeThreeWay(repoPath, texts, { markerSize, labels: [currentLabel, incomingLabel] })
  return { ...base, marked, markerSize }
}

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

/** Marks files resolved as they are in the working tree (a missing file is resolved as deleted). */
export async function markResolved(repoPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await runGit(repoPath, ['add', '-A', '--', ...paths])
}
