// Git LFS: large files kept outside the repo, with a small pointer file committed in their place.

/** Where to get git-lfs when it isn't installed. */
export const LFS_INSTALL_URL = 'https://git-lfs.com'

/** Shown wherever LFS needs git-lfs and it isn't there. */
export const LFS_MISSING_NOTE = "Git LFS isn't installed, so large files show as their pointer files. Install it from git-lfs.com."

/** What the app knows about LFS in a repo. */
export interface LfsInfo {
  /** Whether git-lfs is installed on this machine. */
  installed: boolean
  /** git-lfs's version, e.g. "3.4.1", when installed. */
  version: string | null
  /** The .gitattributes patterns stored in LFS, e.g. "*.psd" or "assets/*.bin". */
  patterns: string[]
}

export const NO_LFS: LfsInfo = { installed: false, version: null, patterns: [] }

/** The real file contents a pointer diff stands for: a text diff, or just the sizes for a binary file. */
export type LfsDiff = { kind: 'text'; diff: string } | { kind: 'binary'; before: number | null; after: number | null }

const POINTER_VERSION = 'version https://git-lfs.github.com/spec/v1'

/** Pointer files are tiny; anything bigger is a real file. */
export const MAX_POINTER_BYTES = 1024

/** The object a pointer file names, or null when `text` isn't a pointer. */
export function parseLfsPointer(text: string): { oid: string; size: number } | null {
  if (text.length > MAX_POINTER_BYTES || !text.startsWith(POINTER_VERSION)) return null
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1]
  const size = /^size (\d+)$/m.exec(text)?.[1]
  return oid && size ? { oid, size: Number(size) } : null
}

/** Whether a diff compares LFS pointer files rather than the files' contents. */
export function isLfsPointerDiff(diffText: string): boolean {
  const lines = diffText.split('\n')
  return lines.some((l) => l.slice(1) === POINTER_VERSION) && lines.some((l) => /^[ +-]oid sha256:/.test(l))
}

/** The paths `git check-attr -z filter` says go through LFS. */
export function lfsPathsFromCheckAttr(output: string): Set<string> {
  const fields = output.split('\0')
  const paths = new Set<string>()
  for (let i = 0; i + 2 < fields.length; i += 3) {
    if (fields[i + 1] === 'filter' && fields[i + 2] === 'lfs') paths.add(fields[i])
  }
  return paths
}

/** The patterns a .gitattributes file (in `dir`, '' for the root) sends through LFS. */
export function lfsPatternsFromAttributes(text: string, dir = ''): string[] {
  const patterns: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [pattern, ...attrs] = line.split(/\s+/)
    if (!attrs.includes('filter=lfs')) continue
    patterns.push(dir && !pattern.startsWith('/') ? `${dir}/${pattern}` : dir ? `${dir}${pattern}` : pattern)
  }
  return patterns
}

/** "3.4.1" from `git lfs version`'s "git-lfs/3.4.1 (GitHub; …)". */
export function parseLfsVersion(output: string): string | null {
  return /git-lfs\/(\S+)/.exec(output)?.[1] ?? null
}

/** What "Track with LFS" offers for `path`: every file with its extension, or just this one. */
export function lfsTrackOptions(path: string): { pattern: string; label: string }[] {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const ext = /\.([^.]+)$/.exec(name)?.[1]
  const options: { pattern: string; label: string }[] = []
  if (ext && name !== `.${ext}`) options.push({ pattern: `*.${ext}`, label: `All *.${ext} files` })
  options.push({ pattern: path, label: 'Only this file' })
  return options
}
