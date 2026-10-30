import { execFile } from 'child_process'
import { promises as fsp } from 'fs'
import { join, resolve, sep } from 'path'
import { promisify } from 'util'
import { imageMime, imageSources, type ImagePair, type ImageSide, type ImageSource } from '../../shared/imageDiff'
import { GitError } from '../gitExec'

const execFileAsync = promisify(execFile)

/** Bigger images aren't drawn; the diff says so instead. */
const MAX_BYTES = 25 * 1024 * 1024

async function readSource(repoPath: string, source: ImageSource): Promise<Buffer | null> {
  if (!source) return null
  if (source.kind === 'file') {
    const full = resolve(join(repoPath, source.path))
    if (!full.startsWith(resolve(repoPath) + sep)) throw new GitError('That path is outside the repository.')
    return fsp.readFile(full).catch(() => null)
  }
  try {
    // runGit returns text, which would mangle the bytes.
    const { stdout } = await execFileAsync('git', ['cat-file', 'blob', source.spec], {
      cwd: repoPath,
      encoding: 'buffer',
      maxBuffer: MAX_BYTES + 1
    })
    return stdout
  } catch {
    // Not there on that side: the image was added or deleted.
    return null
  }
}

function toSide(bytes: Buffer | null, mime: string): ImageSide | null {
  if (!bytes) return null
  if (bytes.length > MAX_BYTES) throw new GitError('That image is too big to show.')
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, bytes: bytes.length }
}

/** Both versions of an image a change compares, see `imageSources`. */
export async function getImagePair(
  repoPath: string,
  change: { hash: string | null; staged: boolean; untracked: boolean; path: string; oldPath?: string }
): Promise<ImagePair> {
  const mime = imageMime(change.path)
  if (!mime) throw new GitError(`${change.path} isn't an image.`)
  const sources = imageSources(change)
  const [before, after] = await Promise.all([readSource(repoPath, sources.before), readSource(repoPath, sources.after)])
  return { before: toSide(before, imageMime(change.oldPath ?? change.path) ?? mime), after: toSide(after, mime) }
}
