import { useEffect, useState, type JSX } from 'react'
import type { TreeFile } from '../../../shared/tree'
import { formatBytes } from '../../../shared/imageDiff'
import { languageForPath } from '../lib/highlight'
import { FileViewPane } from './FileDiffViewer'

interface Props {
  repoPath: string
  hash: string
  /** A file in the commit's tree that the commit itself didn't change. */
  path: string
  onOpenFileView?: (path: string, ref: string | null, mode: 'history' | 'blame') => void
}

/** A file as it was at a commit, read-only: there's no diff to show, since the commit didn't touch it. */
export default function TreeFileView({ repoPath, hash, path, onOpenFileView }: Props): JSX.Element {
  // The last file loaded and which one it is, so another file's stays up while the next loads.
  const [loaded, setLoaded] = useState<{ path: string; file: TreeFile | null; error: string | null } | null>(null)
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.treeFile(repoPath, hash, path).then((res) => {
      if (!cancelled) setLoaded({ path, file: res.ok ? res.data : null, error: res.ok ? null : res.error })
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, hash, path])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])

  const save = async (): Promise<void> => {
    const res = await window.api.saveTreeFile(repoPath, hash, path)
    if (!res.ok) setNote({ ok: false, message: res.error })
    else if (res.data) setNote({ ok: true, message: `Saved to ${res.data}` })
  }

  const file = loaded?.file
  return (
    <div className="file-diff-viewer tree-file-view" role="region" aria-label="File at commit">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="tree-file-note">Unchanged in {hash.slice(0, 7)}</span>
        </div>
        <div className="diff-toolbar-center">
          <button className="text-toggle" onClick={() => void save()} title="Save this version of the file somewhere">
            Save as…
          </button>
          {onOpenFileView && (
            <>
              <button className="text-toggle" onClick={() => onOpenFileView(path, hash, 'blame')} title="Who last changed each line">
                Blame
              </button>
              <button className="text-toggle" onClick={() => onOpenFileView(path, hash, 'history')} title="Every commit that changed this file">
                History
              </button>
            </>
          )}
        </div>
        <div className="diff-toolbar-right">{file && <span className="tree-file-note">{formatBytes(file.bytes)}</span>}</div>
      </div>
      {note && <div className={`revert-status ${note.ok ? 'ok' : 'error'}`}>{note.message}</div>}
      <div className="diff-body" data-testid="tree-file-content">
        {!loaded ? (
          <div className="diff-empty">Loading…</div>
        ) : !file ? (
          <div className="diff-empty">Unable to load file: {loaded.error}</div>
        ) : file.kind === 'text' ? (
          <FileViewPane content={file.text} lang={languageForPath(loaded.path)} loading={false} showWhitespace={false} />
        ) : file.kind === 'image' ? (
          <div className="tree-file-image">
            <img src={file.dataUrl} alt={loaded.path} />
          </div>
        ) : (
          <div className="diff-empty">
            {file.kind === 'binary' ? 'Binary file' : 'Too big to show here'} ({formatBytes(file.bytes)}). Use Save as… to
            open it.
          </div>
        )}
      </div>
    </div>
  )
}
