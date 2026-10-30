// Image files get a picture diff instead of git's "Binary files differ".

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  svg: 'image/svg+xml'
}

/** The image type of a path, by its extension, or null when it isn't an image the window can show. */
export function imageMime(path: string): string | null {
  const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase()
  return (ext && MIME[ext]) || null
}

export interface ImageSide {
  /** A data: URL the renderer can show (the page's CSP only allows 'self' and data: images). */
  dataUrl: string
  bytes: number
}

/** The file before and after a change; null where it didn't exist (added or deleted). */
export interface ImagePair {
  before: ImageSide | null
  after: ImageSide | null
}

/** Where one side of an image change comes from: a git object (`rev:path`) or the file on disk. */
export type ImageSource = { kind: 'object'; spec: string } | { kind: 'file'; path: string } | null

/** Which two versions of `path` a change compares, following how FileDiffViewer is asked for it. */
export function imageSources(change: {
  hash: string | null
  /** Compares against this commit instead of `hash`'s parent. */
  base?: string
  staged: boolean
  untracked: boolean
  path: string
  oldPath?: string
}): { before: ImageSource; after: ImageSource } {
  const { hash, base, staged, untracked, path, oldPath } = change
  if (hash) {
    return {
      before: { kind: 'object', spec: `${base ?? `${hash}^`}:${oldPath ?? path}` },
      after: { kind: 'object', spec: `${hash}:${path}` }
    }
  }
  if (staged) return { before: { kind: 'object', spec: `HEAD:${path}` }, after: { kind: 'object', spec: `:${path}` } }
  if (untracked) return { before: null, after: { kind: 'file', path } }
  return { before: { kind: 'object', spec: `:${path}` }, after: { kind: 'file', path } }
}

/** "12.3 KB" style sizes for the image diff's captions. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
