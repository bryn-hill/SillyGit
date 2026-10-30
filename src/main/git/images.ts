import { imageMime, imageSources, type ImagePair, type ImageSide } from '../../shared/imageDiff'
import { GitError } from '../gitExec'
import { MAX_SHOWN_BYTES, readChangeSide } from './lfs'

function toSide(bytes: Buffer | null, mime: string): ImageSide | null {
  if (!bytes) return null
  if (bytes.length > MAX_SHOWN_BYTES) throw new GitError('That image is too big to show.')
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, bytes: bytes.length }
}

/** Both versions of an image a change compares, see `imageSources`; LFS pointers are swapped for the images. */
export async function getImagePair(
  repoPath: string,
  change: { hash: string | null; base?: string; staged: boolean; untracked: boolean; path: string; oldPath?: string }
): Promise<ImagePair> {
  const mime = imageMime(change.path)
  if (!mime) throw new GitError(`${change.path} isn't an image.`)
  const sources = imageSources(change)
  const [before, after] = await Promise.all([readChangeSide(repoPath, sources.before), readChangeSide(repoPath, sources.after)])
  return { before: toSide(before, imageMime(change.oldPath ?? change.path) ?? mime), after: toSide(after, mime) }
}
