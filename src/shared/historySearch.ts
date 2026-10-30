// Searching and filtering the commit graph: the search box's modes and their
// typed prefixes, and the path filter that narrows the graph to the commits
// touching a file or folder.

export type CommitSearchMode = 'all' | 'message' | 'author' | 'path' | 'change' | 'regex'

export interface CommitSearch {
  mode: CommitSearchMode
  term: string
}

/** Narrows the graph to the commits that touch a path. */
export interface GraphFilter {
  path: string
  /** Any path containing `path`, ignoring case, rather than exactly that file or folder. */
  contains?: boolean
}

export interface SearchModeInfo {
  mode: CommitSearchMode
  label: string
  placeholder: string
  /** What to type before the term to pick this mode from the keyboard. */
  prefixes: string[]
}

export const SEARCH_MODES: SearchModeInfo[] = [
  { mode: 'all', label: 'All', placeholder: 'Search commits', prefixes: [] },
  { mode: 'message', label: 'Message', placeholder: 'Search messages', prefixes: ['message:', 'msg:'] },
  { mode: 'author', label: 'Author', placeholder: 'Search authors', prefixes: ['author:'] },
  { mode: 'path', label: 'File path', placeholder: 'Search file paths', prefixes: ['path:', 'file:'] },
  { mode: 'change', label: 'Changes', placeholder: 'Search added or removed text', prefixes: ['change:', '-S'] },
  { mode: 'regex', label: 'Changes (regex)', placeholder: 'Search changed lines by regex', prefixes: ['regex:', '-G'] }
]

/** The tooltip on the search box, listing the typed prefixes. */
export const SEARCH_SYNTAX_HINT = [
  'Search commits. Start with a prefix to pick what to search:',
  ...SEARCH_MODES.filter((m) => m.prefixes.length > 0).map((m) => `${m.prefixes.join(' or ')}  ${m.label.toLowerCase()}`)
].join('\n')

/**
 * What the search box is looking for: a typed prefix ("author:ada", "-Sfoo")
 * picks the mode, otherwise the mode chosen in the dropdown applies.
 */
export function parseSearch(text: string, mode: CommitSearchMode): CommitSearch {
  const trimmed = text.trim()
  for (const info of SEARCH_MODES) {
    for (const prefix of info.prefixes) {
      // -S and -G are git's own spelling and case matters; the word prefixes don't.
      const matches = prefix.startsWith('-')
        ? trimmed.startsWith(prefix)
        : trimmed.toLowerCase().startsWith(prefix)
      if (matches) return { mode: info.mode, term: trimmed.slice(prefix.length).trim() }
    }
  }
  return { mode, term: trimmed }
}

/** What the filter chip says. */
export function graphFilterLabel(filter: GraphFilter): string {
  return filter.contains ? `Paths containing “${filter.path}”` : `History of ${filter.path}`
}

/** The folder a file is in, or null for a file at the top of the repo. */
export function folderOf(path: string): string | null {
  const slash = path.replace(/\/+$/, '').lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : null
}

/** Every folder the files are in, including the folders those are in, sorted. */
export function foldersOf(files: string[]): string[] {
  const folders = new Set<string>()
  for (const file of files) {
    for (let folder = folderOf(file); folder && !folders.has(folder); folder = folderOf(folder)) folders.add(folder)
  }
  return [...folders].sort()
}

function escapeGlob(text: string): string {
  return text.replace(/[\\*?[\]]/g, (c) => `\\${c}`)
}

/**
 * The pathspecs for the commits touching a filter's path: the exact file or
 * folder, or with `contains` any file or folder whose path contains it.
 */
export function filterPathspecs(filter: GraphFilter): string[] {
  const path = filter.path.trim().replace(/^\.?\/+/, '').replace(/\/+$/, '')
  if (!filter.contains) return [`:(literal)${path}`]
  const glob = `**/*${escapeGlob(path)}*`
  // The second matches files inside a folder whose name contains it.
  return [`:(icase,glob)${glob}`, `:(icase,glob)${glob}/**`]
}
