// A commit's whole tree: every file in it, not just the ones it changed.

/** One entry of `git ls-tree -r`. */
export interface TreeEntry {
  path: string
  /** A symlink's target is its content; a submodule is a commit of another repo, with no size. */
  kind: 'file' | 'link' | 'submodule'
  /** Bytes, or null for a submodule. */
  size: number | null
}

/** A file read at a commit, as the window can show it. */
export type TreeFile =
  | { kind: 'text'; text: string; bytes: number }
  | { kind: 'image'; dataUrl: string; bytes: number }
  | { kind: 'binary'; bytes: number }
  | { kind: 'too-large'; bytes: number }

/** Parses `git ls-tree -r -z --long`: `<mode> <type> <object> <size>\t<path>`, NUL separated. */
export function parseLsTree(out: string): TreeEntry[] {
  const entries: TreeEntry[] = []
  for (const record of out.split('\0')) {
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const [mode, type, , size] = record.slice(0, tab).split(/\s+/)
    const path = record.slice(tab + 1)
    if (type === 'commit') entries.push({ path, kind: 'submodule', size: null })
    else if (type === 'blob')
      entries.push({
        path,
        kind: mode === '120000' ? 'link' : 'file',
        size: Number(size)
      })
  }
  return entries
}

/** A row of the folder tree as it's drawn: a folder (open or not) or a file, indented by `depth`. */
export type TreeRow =
  | {
      type: 'folder'
      path: string
      name: string
      depth: number
      open: boolean
      files: number
    }
  | {
      type: 'file'
      path: string
      name: string
      depth: number
      entry: TreeEntry
    }

interface Folder {
  folders: Map<string, Folder>
  files: TreeEntry[]
  count: number
}

function folderTree(entries: TreeEntry[]): Folder {
  const root: Folder = { folders: new Map(), files: [], count: 0 }
  for (const entry of entries) {
    const parts = entry.path.split('/')
    let at = root
    at.count++
    for (const part of parts.slice(0, -1)) {
      let next = at.folders.get(part)
      if (!next) {
        next = { folders: new Map(), files: [], count: 0 }
        at.folders.set(part, next)
      }
      next.count++
      at = next
    }
    at.files.push(entry)
  }
  return root
}

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/**
 * The rows to draw for `entries`, folders first and then files, each sorted by name.
 * Only the folders in `open` show what's inside them.
 */
export function treeRows(entries: TreeEntry[], open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (folder: Folder, prefix: string, depth: number): void => {
    for (const name of [...folder.folders.keys()].sort(byName)) {
      const path = prefix + name
      const child = folder.folders.get(name)!
      const isOpen = open.has(path)
      rows.push({
        type: 'folder',
        path,
        name,
        depth,
        open: isOpen,
        files: child.count
      })
      if (isOpen) walk(child, `${path}/`, depth + 1)
    }
    const files = [...folder.files].sort((a, b) => byName(a.path, b.path))
    for (const entry of files)
      rows.push({
        type: 'file',
        path: entry.path,
        name: entry.path.slice(prefix.length),
        depth,
        entry
      })
  }
  walk(folderTree(entries), '', 0)
  return rows
}

/** The files whose path holds every word of `query`, ignoring case; all of them for an empty query. */
export function filterTree(entries: TreeEntry[], query: string): TreeEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return entries
  return entries.filter((e) => {
    const path = e.path.toLowerCase()
    return words.every((w) => path.includes(w))
  })
}

/** The folders holding `path`, outermost first: `a/b/c.ts` is in `a` and `a/b`. */
export function parentFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}
