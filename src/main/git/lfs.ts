import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { promisify } from 'util'
import { imageSources, type ImageSource } from '../../shared/imageDiff'
import {
  lfsPathsFromCheckAttr,
  lfsPatternsFromAttributes,
  parseLfsPointer,
  parseLfsVersion,
  type LfsDiff,
  type LfsInfo
} from '../../shared/lfs'
import { GitError, remoteEnv, runGit, runGitWithInput } from '../gitExec'

// Git LFS: finding which files it stores, swapping pointers for the real
// files, tracking new patterns, and fetching, pulling and pruning objects.

const execFileAsync = promisify(execFile)

/** Bigger files aren't read into the window; the diff says so instead. */
export const MAX_SHOWN_BYTES = 25 * 1024 * 1024

const NOT_INSTALLED = /'lfs' is not a git command|git-lfs: (command )?not found|unknown subcommand/i

/** Git's "not a git command" for lfs, said plainly. */
function lfsError(err: unknown): GitError {
  const message = err instanceof Error ? err.message : String(err)
  if (NOT_INSTALLED.test(message)) {
    return new GitError("Git LFS isn't installed, so this file is only its pointer here. Install it from git-lfs.com.")
  }
  return err instanceof GitError ? err : new GitError(message)
}

// Once found, git-lfs stays installed; not finding it is asked again, in case it was installed since.
let installedVersion: string | null = null

export async function lfsVersion(repoPath: string): Promise<string | null> {
  if (installedVersion) return installedVersion
  try {
    installedVersion = parseLfsVersion(await runGit(repoPath, ['lfs', 'version']))
  } catch {
    return null
  }
  return installedVersion
}

/** Whether git-lfs is installed, and which patterns the repo's .gitattributes files send through it. */
export async function getLfsInfo(repoPath: string): Promise<LfsInfo> {
  const [version, files] = await Promise.all([
    lfsVersion(repoPath),
    runGit(repoPath, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.gitattributes', '*/.gitattributes']).catch(() => '')
  ])
  const attributeFiles = [...new Set(['.gitattributes', ...files.split('\0').filter(Boolean)])]
  const patterns = (
    await Promise.all(
      attributeFiles.map(async (file) => {
        const text = await fsp.readFile(join(repoPath, file), 'utf8').catch(() => '')
        return lfsPatternsFromAttributes(text, file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')
      })
    )
  ).flat()
  return { installed: version != null, version, patterns }
}

/**
 * Which of `paths` LFS stores, by the .gitattributes at `rev` (the working
 * tree's when null). Asks git rather than matching patterns, so it agrees
 * with what git does, and works without git-lfs installed.
 */
export async function lfsPaths(repoPath: string, paths: string[], rev: string | null = null): Promise<Set<string>> {
  if (paths.length === 0) return new Set()
  const input = paths.join('\0') + '\0'
  const check = (source: string[]): Promise<Buffer> =>
    runGitWithInput(repoPath, ['check-attr', '-z', '--stdin', ...source, 'filter'], input)
  try {
    // --source needs git 2.40; older ones read the working tree's attributes, which is nearly always the same.
    const out = rev ? await check([`--source=${rev}`]).catch(() => check([])) : await check([])
    return lfsPathsFromCheckAttr(out.toString('utf8'))
  } catch {
    return new Set()
  }
}

/** Sets `lfs` on the entries LFS stores. */
export async function markLfs<T extends { path: string; lfs?: boolean }>(
  repoPath: string,
  entries: T[],
  rev: string | null = null
): Promise<void> {
  const lfs = await lfsPaths(repoPath, [...new Set(entries.map((e) => e.path))], rev)
  if (lfs.size === 0) return
  for (const entry of entries) if (lfs.has(entry.path)) entry.lfs = true
}

/** The real file for pointer `bytes`, downloading it when it isn't here yet; anything else as it is. */
export async function smudgeIfPointer(repoPath: string, path: string, bytes: Buffer): Promise<Buffer> {
  const pointer = parseLfsPointer(bytes.toString('utf8'))
  if (!pointer) return bytes
  if (pointer.size > MAX_SHOWN_BYTES) throw new GitError(`${path} is too big to show (${pointer.size} bytes in Git LFS).`)
  try {
    return await runGitWithInput(repoPath, ['lfs', 'smudge', '--', path], bytes, await remoteEnv())
  } catch (err) {
    throw lfsError(err)
  }
}

/** One side of a change (see `imageSources`): its bytes, or null where the file didn't exist. */
export async function readChangeSide(repoPath: string, source: ImageSource): Promise<Buffer | null> {
  if (!source) return null
  if (source.kind === 'file') {
    const full = resolve(join(repoPath, source.path))
    if (!full.startsWith(resolve(repoPath) + sep)) throw new GitError('That path is outside the repository.')
    // The working copy is already the real file, unless git-lfs wasn't there to fetch it.
    const bytes = await fsp.readFile(full).catch(() => null)
    return bytes && smudgeIfPointer(repoPath, source.path, bytes)
  }
  let bytes: Buffer
  try {
    // runGit returns text, which would mangle the bytes.
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', source.spec], {
      cwd: repoPath,
      encoding: 'buffer',
      maxBuffer: MAX_SHOWN_BYTES + 1
    })
    bytes = stdout
  } catch {
    // Not there on that side: the file was added or deleted.
    return null
  }
  return smudgeIfPointer(repoPath, source.spec.slice(source.spec.indexOf(':') + 1), bytes)
}

/** Names the file in a `diff --no-index` of temp copies, instead of the copies. */
function renameDiffHeaders(diff: string, oldName: string, newName: string): string {
  const lines = diff.split('\n')
  for (let i = 0; i < lines.length && !lines[i].startsWith('@@'); i++) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) lines[i] = `diff --git a/${oldName} b/${newName}`
    else if (line.startsWith('--- ') && line !== '--- /dev/null') lines[i] = `--- a/${oldName}`
    else if (line.startsWith('+++ ') && line !== '+++ /dev/null') lines[i] = `+++ b/${newName}`
  }
  return lines.join('\n')
}

const isBinary = (bytes: Buffer): boolean => bytes.subarray(0, 8000).includes(0)

/** The diff of what an LFS file's pointers stand for, the way FileDiffViewer is asked for a change. */
export async function getLfsDiff(
  repoPath: string,
  change: { hash: string | null; base?: string; staged: boolean; untracked: boolean; path: string; oldPath?: string }
): Promise<LfsDiff> {
  const sources = imageSources(change)
  const [before, after] = await Promise.all([readChangeSide(repoPath, sources.before), readChangeSide(repoPath, sources.after)])
  if ((before && isBinary(before)) || (after && isBinary(after))) {
    return { kind: 'binary', before: before?.length ?? null, after: after?.length ?? null }
  }
  const dir = join(tmpdir(), `sillygit-lfs-${randomUUID()}`)
  await fsp.mkdir(dir)
  try {
    const write = async (name: string, bytes: Buffer | null): Promise<string> => {
      if (!bytes) return '/dev/null'
      const file = join(dir, name)
      await fsp.writeFile(file, bytes)
      return file
    }
    const [a, b] = await Promise.all([write('before', before), write('after', after)])
    let diff = ''
    try {
      diff = await runGit(repoPath, ['diff', '--no-color', '--no-index', '--', a, b])
    } catch (err) {
      // git diff --no-index exits 1 when the files differ, with the diff on stdout.
      if (!(err instanceof GitError) || !err.stdout) throw err
      diff = err.stdout
    }
    return { kind: 'text', diff: renameDiffHeaders(diff, change.oldPath ?? change.path, change.path) }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
}

/** Sends `pattern` through LFS from now on, setting up LFS's filters in this repo first if they aren't anywhere. */
export async function lfsTrack(repoPath: string, pattern: string): Promise<void> {
  try {
    const configured = await runGit(repoPath, ['config', '--get', 'filter.lfs.clean']).catch(() => '')
    if (!configured.trim()) await runGit(repoPath, ['lfs', 'install', '--local'])
    await runGit(repoPath, ['lfs', 'track', '--', pattern])
  } catch (err) {
    throw lfsError(err)
  }
}

/** `git lfs fetch`, `pull` or `prune`. */
export async function lfsCommand(repoPath: string, command: 'fetch' | 'pull' | 'prune'): Promise<void> {
  try {
    await runGit(repoPath, ['lfs', command], command === 'prune' ? undefined : await remoteEnv())
  } catch (err) {
    throw lfsError(err)
  }
}
