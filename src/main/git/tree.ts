import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { imageMime } from '../../shared/imageDiff'
import { parseLsTree, type TreeEntry, type TreeFile } from '../../shared/tree'
import { GitError, runGit } from '../gitExec'
import { MAX_SHOWN_BYTES, readChangeSide } from './lfs'

// Browsing a commit's whole tree: listing it, reading a file from it and saving one out.

/** Every file in `ref`'s tree, not just the ones it changed. */
export async function listTreeAtRef(repoPath: string, ref: string): Promise<TreeEntry[]> {
  return parseLsTree(await runGit(repoPath, ['ls-tree', '-r', '-z', '--long', ref]))
}

const isBinary = (bytes: Buffer): boolean => bytes.subarray(0, 8000).includes(0)

/** `path` as it was at `ref`, as text, an image or just its size; an LFS pointer is swapped for the file. */
export async function readTreeFile(repoPath: string, ref: string, path: string): Promise<TreeFile> {
  const spec = `${ref}:${path}`
  const size = Number((await runGit(repoPath, ['cat-file', '-s', spec])).trim())
  if (size > MAX_SHOWN_BYTES) return { kind: 'too-large', bytes: size }
  const bytes = await readChangeSide(repoPath, { kind: 'object', spec })
  if (!bytes) throw new GitError(`${path} isn't in ${ref.slice(0, 7)}.`)
  const mime = imageMime(path)
  if (mime)
    return {
      kind: 'image',
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      bytes: bytes.length
    }
  if (isBinary(bytes)) return { kind: 'binary', bytes: bytes.length }
  return { kind: 'text', text: bytes.toString('utf8'), bytes: bytes.length }
}

/**
 * Writes `path` as it was at `ref` to `dest`, streamed so size doesn't matter. `--filters` runs the
 * repo's smudge filters, so an LFS file comes out as the real file and line endings as checked out.
 */
export function saveTreeFile(repoPath: string, ref: string, path: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--filters', `${ref}:${path}`], {
      cwd: repoPath
    })
    const out = createWriteStream(dest)
    const err: Buffer[] = []
    let code: number | null = null
    let written = false
    const settle = (): void => {
      if (code === null || !written) return
      if (code === 0) resolve()
      else reject(new GitError(Buffer.concat(err).toString('utf8').trim() || `git cat-file exited with ${code}`))
    }
    child.stdout.pipe(out)
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', (e) => reject(new GitError(e.message)))
    out.on('error', (e) => reject(new GitError(e.message)))
    out.on('finish', () => {
      written = true
      settle()
    })
    child.on('close', (exit) => {
      code = exit ?? 1
      settle()
    })
  })
}
