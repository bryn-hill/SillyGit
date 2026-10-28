import { execFile, spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ConflictFileContent, OperationState, RenameConflict } from '../../shared/types'
import { GitError, runGit } from '../gitExec'
import { getOperationState, gitDir, readTrimmed } from './operation'

// Reading a conflicted file for the resolver: each side, the merge with
// conflict markers, and renames or deletes on either side.

export interface StageEntry {
  mode: string
  sha: string
}

/** The index stages of a conflicted path: 1 base, 2 current (ours), 3 incoming (theirs). */
export async function stageEntries(repoPath: string, path: string): Promise<Map<number, StageEntry>> {
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
export async function conflictStages(repoPath: string, path: string): Promise<Map<number, string>> {
  const entries = await stageEntries(repoPath, path)
  return new Map([...entries].map(([stage, e]) => [stage, e.sha]))
}

/** A blob's exact bytes (runGit decodes output as text). */
export function blobBytes(repoPath: string, sha: string): Promise<Buffer> {
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
export function runGitWithInput(repoPath: string, args: string[], input: string): Promise<void> {
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

export const DEFAULT_MARKER_SIZE = 7

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
export async function readThreeWay(
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
export async function mergeThreeWay(
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
export async function findRenameConflict(
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
