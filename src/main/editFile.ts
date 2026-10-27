import { promises as fsp } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import type { EditableFile } from '../shared/types'

/** Bigger files open slowly in the editor and are rarely hand-edited. */
export const MAX_EDITABLE_BYTES = 5 * 1024 * 1024

/** Resolves a repo-relative path, refusing anything that escapes the repo. */
export function resolveInRepo(repoPath: string, path: string): string {
  const root = resolve(repoPath)
  const abs = resolve(root, path)
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${path} is outside the repository`)
  if (rel.split(/[\\/]/)[0] === '.git') throw new Error('Files inside .git cannot be edited')
  return abs
}

/** Treats a NUL byte in the first 8 KB as binary, as git does. */
export function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 8000)
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true
  return false
}

export async function readEditableFile(repoPath: string, path: string): Promise<EditableFile> {
  const abs = resolveInRepo(repoPath, path)
  const stat = await fsp.stat(abs).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  if (!stat) return { kind: 'missing', absolutePath: abs }
  if (!stat.isFile()) throw new Error(`${path} is not a file`)
  if (stat.size > MAX_EDITABLE_BYTES) return { kind: 'too-large', absolutePath: abs, size: stat.size }
  const bytes = await fsp.readFile(abs)
  if (looksBinary(bytes)) return { kind: 'binary', absolutePath: abs, size: stat.size }
  return { kind: 'text', absolutePath: abs, content: bytes.toString('utf-8') }
}

/** Writes the file in place, keeping its mode (fsp.writeFile on an existing file does). */
export async function writeEditableFile(repoPath: string, path: string, content: string): Promise<void> {
  await fsp.writeFile(resolveInRepo(repoPath, path), content, 'utf-8')
}
