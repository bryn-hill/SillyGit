import { useContext, useEffect, useState, type JSX } from 'react'
import { filterTree, treeRows, type TreeEntry, type TreeRow } from '../../../../shared/tree'
import { formatBytes } from '../../../../shared/imageDiff'
import ContextMenu from '../ContextMenu'
import { fileMenuSections } from '../fileMenu'
import { useCustomCommandMenu } from '../../lib/customCommandMenu'
import { EditorContext } from '../../lib/editorMenu'
import { onFileListKeyDown } from '../../lib/fileListNav'
import type { OpenFileView } from './types'

interface Props {
  repoPath: string
  hash: string
  /** The files this commit changed and how, so they stand out in the tree. */
  changed: ReadonlyMap<string, string>
  activePath: string | null
  /** Folders shown open; kept by the parent so stepping through commits keeps them. */
  openFolders: ReadonlySet<string>
  onToggleFolder: (path: string) => void
  /** Shows the file full window as it was at this commit. */
  onOpenFile: (path: string) => void
  onOpenFileView: OpenFileView
  onFilterHistory?: (path: string) => void
  onCopyText: (text: string) => void
}

/** Every file in the commit's tree, as folders, to open, save, blame or follow back through history. */
export default function CommitFilesTab({
  repoPath,
  hash,
  changed,
  activePath,
  openFolders,
  onToggleFolder,
  onOpenFile,
  onOpenFileView,
  onFilterHistory,
  onCopyText
}: Props): JSX.Element {
  const [tree, setTree] = useState<{
    entries: TreeEntry[] | null
    error: string | null
  } | null>(null)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{
    x: number
    y: number
    entry: TreeEntry
  } | null>(null)
  const [saveNote, setSaveNote] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const customMenu = useCustomCommandMenu()
  const editor = useContext(EditorContext)

  // The parent keys this tab by commit, so this only ever loads one tree.
  useEffect(() => {
    let cancelled = false
    window.api.tree(repoPath, hash).then((res) => {
      if (!cancelled) setTree(res.ok ? { entries: res.data, error: null } : { entries: null, error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  useEffect(() => {
    if (!saveNote) return
    const t = setTimeout(() => setSaveNote(null), 4000)
    return () => clearTimeout(t)
  }, [saveNote])

  const save = async (path: string): Promise<void> => {
    const res = await window.api.saveTreeFile(repoPath, hash, path)
    if (!res.ok) setSaveNote({ ok: false, message: res.error })
    else if (res.data) setSaveNote({ ok: true, message: `Saved to ${res.data}` })
  }

  if (!tree) return <div className="commit-files-empty">Loading files…</div>
  if (!tree.entries) return <div className="commit-files-empty">{tree.error}</div>

  const searching = query.trim() !== ''
  const rows: TreeRow[] = searching
    ? filterTree(tree.entries, query).map((entry) => ({
        type: 'file',
        path: entry.path,
        name: entry.path,
        depth: 0,
        entry
      }))
    : treeRows(tree.entries, openFolders)

  return (
    <div className="commit-files">
      <input
        className="filter-input commit-files-filter"
        type="search"
        placeholder={`Filter ${tree.entries.length} files`}
        aria-label="Filter files"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {saveNote && (
        <div className={`commit-files-note ${saveNote.ok ? '' : 'error'}`} role="status">
          {saveNote.message}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="commit-files-empty">{searching ? 'No files match.' : 'This commit has no files.'}</div>
      ) : (
        <ul className="file-list commit-tree" aria-label="Files at this commit" onKeyDown={onFileListKeyDown}>
          {rows.map((row) => (
            <li key={`${row.type}:${row.path}`}>
              {row.type === 'folder' ? (
                <div
                  className="tree-folder-row"
                  style={{ paddingLeft: 6 + row.depth * 14 }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={row.open}
                  onClick={() => onToggleFolder(row.path)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    onToggleFolder(row.path)
                  }}
                >
                  <span className="tree-chevron" aria-hidden>
                    {row.open ? '▾' : '▸'}
                  </span>
                  <span className="file-path">{row.name}</span>
                  <span className="tree-count">{row.files}</span>
                </div>
              ) : (
                <TreeFileRow
                  row={row}
                  status={changed.get(row.path)}
                  active={activePath === row.path}
                  onOpen={() => onOpenFile(row.path)}
                  onMenu={(x, y) => setMenu({ x, y, entry: row.entry })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          sections={[
            [
              {
                id: 'open',
                label: 'Open file',
                disabled: menu.entry.kind === 'submodule',
                onSelect: () => onOpenFile(menu.entry.path)
              },
              {
                id: 'save-as',
                label: 'Save as…',
                disabled: menu.entry.kind === 'submodule',
                onSelect: () => void save(menu.entry.path)
              }
            ],
            ...fileMenuSections({
              path: menu.entry.path,
              onBlame: () => onOpenFileView(menu.entry.path, hash, 'blame'),
              onHistory: () => onOpenFileView(menu.entry.path, hash, 'history'),
              onFilterHistory,
              onOpenInEditor: () => editor.open(menu.entry.path),
              editorName: editor.name,
              onCopyPath: () => onCopyText(menu.entry.path),
              custom: customMenu('file', { file: menu.entry.path, sha: hash })
            })
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function TreeFileRow({
  row,
  status,
  active,
  onOpen,
  onMenu
}: {
  row: Extract<TreeRow, { type: 'file' }>
  status: string | undefined
  active: boolean
  onOpen: () => void
  onMenu: (x: number, y: number) => void
}): JSX.Element {
  const { entry } = row
  const submodule = entry.kind === 'submodule'
  return (
    <div
      className={`file-row ${active ? 'active' : ''} ${submodule ? 'tree-submodule' : ''}`}
      style={{ paddingLeft: 20 + row.depth * 14 }}
      aria-current={active}
      tabIndex={-1}
      title={submodule ? `${entry.path} is a submodule` : entry.path}
      onClick={submodule ? undefined : onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
    >
      <span className="file-path">{row.name}</span>
      {status && (
        <span className={`status-code code-${status[0]}`} title="Changed in this commit">
          {status[0]}
        </span>
      )}
      <span className="tree-size">
        {submodule ? 'submodule' : entry.kind === 'link' ? 'link' : formatBytes(entry.size ?? 0)}
      </span>
    </div>
  )
}
