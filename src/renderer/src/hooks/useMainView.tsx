import { useRef, useState } from 'react'
import type { CommitSearchHit, FileStatus } from '../../../shared/types'
import type { ClickModifiers } from '../components/CommitGraph'
import type { FileViewMode, FileViewTarget } from '../components/FileHistoryView'
import type { ActiveFile } from '../components/DetailPanel'
import { clickCommit, fixSelection, type Selection } from '../lib/selection'
import type { Repo } from './useRepo'
import { useArrowKeySelection } from './useArrowKeySelection'

/**
 * What the main area shows and how you move around it: the selection in the
 * graph, and what can take the graph's place (Launchpad, the merge resolver,
 * the interactive rebase editor, a file's history or blame, the file editor,
 * a working file's diff, or a commit full window).
 */
export function useMainView({
  repo,
  hasWorkingChanges,
  keysBlocked
}: {
  repo: Repo
  hasWorkingChanges: boolean
  /** A dialog is open, so the arrow keys are left alone. */
  keysBlocked: boolean
}) {
  const { repoPath, status, commitByHash, graphRows, graphOrder } = repo
  const [selection, setSelection] = useState<Selection>({ type: 'working' })
  const [showLaunchpad, setShowLaunchpad] = useState(false)
  const [resolvingPath, setResolvingPath] = useState<string | null>(null)
  // The interactive rebase being planned, and the repo it's for.
  const [rebaseEditor, setRebaseEditor] = useState<{ repoPath: string; base: string } | null>(null)
  const rebaseBase = rebaseEditor && rebaseEditor.repoPath === repoPath ? rebaseEditor.base : null
  // The file open in the editor, per repo tab, and unsaved text left in files
  // whose editor was hidden (tab switch, Launchpad, another file opened).
  const [editingFiles, setEditingFiles] = useState<Record<string, string>>({})
  const editorDrafts = useRef(new Map<string, string>())
  const [fullScreenHash, setFullScreenHash] = useState<string | null>(null)
  const [fullScreenPath, setFullScreenPath] = useState<string | null>(null)
  // A line to scroll to in the commit full window's file, from an AI review finding.
  const [fullScreenLine, setFullScreenLine] = useState<number | undefined>()
  /** A file's history or blame, shown in place of the graph. */
  const [fileView, setFileView] = useState<FileViewTarget | null>(null)
  // Bumped on every open, so the view starts fresh even for the same file.
  const [fileViewOpens, setFileViewOpens] = useState(0)
  // An uncommitted file's diff shown in place of the graph, from the unstaged or staged list.
  const [workingDiff, setWorkingDiff] = useState<{ path: string; staged: boolean } | null>(null)
  // History or Blame as last picked in the open file view, kept when another file is picked beside it.
  const fileViewMode = useRef<FileViewMode>('history')
  const [searchFocusToken, setSearchFocusToken] = useState(0)

  // Keep the selection on something that exists, fixed up while rendering so a
  // stale selection never paints.
  const fixedSelection = fixSelection(
    selection,
    (hash) => commitByHash.has(hash),
    graphRows[0]?.commit.hash ?? null,
    hasWorkingChanges
  )
  if (fixedSelection !== selection) setSelection(fixedSelection)

  // Keep an open working diff on its file as it's staged or unstaged; close it once the file has no changes left.
  // Fixed up while rendering, so the diff never paints for a side the file has left.
  if (workingDiff && status) {
    const listed = (staged: boolean): boolean =>
      (staged ? status.staged : status.unstaged).some((f) => f.path === workingDiff.path)
    if (!listed(workingDiff.staged)) {
      setWorkingDiff(listed(!workingDiff.staged) ? { ...workingDiff, staged: !workingDiff.staged } : null)
    }
  }

  useArrowKeySelection(
    !(fullScreenHash || workingDiff || showLaunchpad || keysBlocked || resolvingPath || rebaseBase),
    selection,
    graphOrder,
    hasWorkingChanges,
    setSelection
  )

  /** Back to the graph from a full-window commit, file history or working diff. */
  const closeFileViews = (): void => {
    setFullScreenHash(null)
    setFileView(null)
    setWorkingDiff(null)
  }

  /** After a command stopped on conflicts: the working changes, so the conflicted files are in view. */
  const showConflicts = (): void => {
    closeFileViews()
    setSelection({ type: 'working' })
  }

  const goToWorkingChanges = (): void => {
    closeFileViews()
    setShowLaunchpad(false)
    setSelection({ type: 'working' })
  }

  /** Puts the view back for a repo (tab) that's now showing, with the selection it had last time. */
  const resetForRepo = (lastSelection: Selection | undefined): void => {
    setSelection(lastSelection ?? { type: 'working' })
    closeFileViews()
    setResolvingPath(null)
  }

  const showFileView = (target: FileViewTarget): void => {
    setFileView(target)
    setFileViewOpens((n) => n + 1)
  }

  /** Shows a file's history or blame in place of the graph; a null `ref` starts from the working tree. */
  const openFileView = (path: string, ref: string | null, mode: FileViewMode): void => {
    setShowLaunchpad(false)
    setRebaseEditor(null)
    fileViewMode.current = mode
    showFileView({ path, ref, mode })
  }

  const editingPath = repoPath ? editingFiles[repoPath] : undefined
  const openEditor = (path: string): void => {
    if (repoPath) setEditingFiles((current) => ({ ...current, [repoPath]: path }))
  }
  const closeEditor = (): void => {
    if (!repoPath) return
    setEditingFiles(({ [repoPath]: _closed, ...rest }) => rest)
  }

  /**
   * Drops the editors (and unsaved drafts) of repos whose tabs are closing,
   * asking first when there are drafts. False when that's cancelled.
   */
  const closeEditorsFor = (paths: string[]): boolean => {
    const draftKeys = [...editorDrafts.current.keys()].filter((key) => paths.includes(key.split('\0')[0]))
    if (draftKeys.length > 0) {
      const files = draftKeys.map((key) => key.split('\0')[1]).join(', ')
      if (!window.confirm(`Discard unsaved changes to ${files}?`)) return false
      draftKeys.forEach((key) => editorDrafts.current.delete(key))
    }
    setEditingFiles((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !paths.includes(path))))
    return true
  }

  /** Opens a working change's diff full window; with history or blame open, switches that to the file instead. */
  const openWorkingFile = (file: FileStatus, staged: boolean): void => {
    if (fileView) {
      showFileView({ path: file.path, ref: null, mode: fileViewMode.current })
      setWorkingDiff({ path: file.path, staged })
      return
    }
    // Clicking the open file again closes the diff.
    if (workingDiff?.path === file.path && workingDiff.staged === staged) {
      setWorkingDiff(null)
      return
    }
    closeEditor()
    setWorkingDiff({ path: file.path, staged })
  }

  /** Opens a commit's file diff full window, at `line` when given; clicking the open file again closes it. */
  const openCommitFile = (hash: string, path: string, line?: number): void => {
    if (fileView) {
      showFileView({ path, ref: hash, mode: fileViewMode.current })
      return
    }
    if (line === undefined && fullScreenHash === hash && fullScreenPath === path && !editingPath) {
      setFullScreenHash(null)
      return
    }
    closeEditor()
    setFullScreenHash(hash)
    setFullScreenPath(path)
    setFullScreenLine(line)
  }

  /** From history or blame: a commit's diff full window, at that file. */
  const openCommitFromFileView = (hash: string, path: string): void => {
    setFileView(null)
    setWorkingDiff(null)
    closeEditor()
    setFullScreenHash(hash)
    setFullScreenPath(path)
    setFullScreenLine(undefined)
    setSelection({ type: 'commit', hash })
  }

  /** From history or blame: the file in the editor. */
  const editFromFileView = (path: string): void => {
    setFileView(null)
    setWorkingDiff(null)
    openEditor(path)
  }

  /** In the commit full window: move to another commit (a parent, say). */
  const navigateToCommit = (hash: string): void => {
    setFullScreenHash(hash)
    setFullScreenPath(null)
    setFullScreenLine(undefined)
    setSelection({ type: 'commit', hash })
  }

  /** Back from history or blame to the file's diff, when it's one of the listed changes. */
  const fileViewDiff = (): (() => void) | undefined => {
    if (!fileView) return undefined
    const { path } = fileView
    if (selection.type === 'commit' && fileView.ref === selection.hash) {
      const hash = selection.hash
      return () => {
        setFileView(null)
        setFullScreenHash(hash)
        setFullScreenPath(path)
        setFullScreenLine(undefined)
      }
    }
    if (selection.type === 'working' && fileView.ref == null && status) {
      const staged = workingDiff?.path === path ? workingDiff.staged : !status.unstaged.some((f) => f.path === path)
      if (!(staged ? status.staged : status.unstaged).some((f) => f.path === path)) return undefined
      return () => {
        setFileView(null)
        setWorkingDiff({ path, staged })
      }
    }
    return undefined
  }

  /** The file the detail panel's lists highlight: the one in history or blame, the working diff or the commit's file. */
  const activeFile: ActiveFile | null = fileView
    ? {
        path: fileView.path,
        staged: workingDiff?.path === fileView.path ? workingDiff.staged : !status?.unstaged.some((f) => f.path === fileView.path)
      }
    : (workingDiff ?? (fullScreenHash && fullScreenPath ? { path: fullScreenPath } : null))

  const handleClickCommit = (hash: string, modifiers: ClickModifiers): void =>
    setSelection((current) => clickCommit(current, hash, modifiers, graphOrder))

  /** Clicking the selected WIP row again deselects it and closes the side bar. */
  const toggleWorking = (): void => setSelection(selection.type === 'working' ? { type: 'none' } : { type: 'working' })

  /** Selects one commit, loading more of the graph first when it's further down than what's loaded. */
  const jumpToCommit = async (hit: CommitSearchHit): Promise<void> => {
    if (!commitByHash.has(hit.hash)) await repo.loadThrough(hit.index)
    closeFileViews()
    setSelection({ type: 'commit', hash: hit.hash })
  }

  /** From the side bar: select the commit a branch points at, searching for it if it isn't loaded. */
  const selectBranchCommit = async (hash: string): Promise<void> => {
    if (!repoPath) return
    if (commitByHash.has(hash)) {
      setSelection({ type: 'commit', hash })
      return
    }
    const res = await window.api.searchCommits(repoPath, hash)
    const hit = res.ok ? res.data.find((h) => h.hash === hash) : undefined
    if (hit) await jumpToCommit(hit)
  }

  const showCommitInGraph = (hash: string): void => {
    closeFileViews()
    closeEditor()
    void selectBranchCommit(hash)
  }

  const focusSearch = (): void => {
    closeFileViews()
    setShowLaunchpad(false)
    setResolvingPath(null)
    setSearchFocusToken((n) => n + 1)
  }

  /** Opens the interactive rebase editor for the commits after `base`. */
  const planRebase = (base: string): void => {
    if (!repoPath) return
    setFullScreenHash(null)
    setResolvingPath(null)
    closeEditor()
    setFileView(null)
    setWorkingDiff(null)
    setRebaseEditor({ repoPath, base })
  }

  return {
    selection,
    setSelection,
    showLaunchpad,
    setShowLaunchpad,
    resolvingPath,
    setResolvingPath,
    rebaseBase,
    closeRebase: () => setRebaseEditor(null),
    planRebase,
    editingPath,
    /** Unsaved text left in a repo's file whose editor was hidden. */
    loadDraft: (path: string): string | undefined => editorDrafts.current.get(`${repoPath}\0${path}`),
    saveDraft: (path: string, draft: string | null): void => {
      const key = `${repoPath}\0${path}`
      if (draft == null) editorDrafts.current.delete(key)
      else editorDrafts.current.set(key, draft)
    },
    openEditor,
    closeEditor,
    closeEditorsFor,
    fullScreenHash,
    fullScreenPath,
    fullScreenLine,
    /** The commit full window picked its first file, having opened without one. */
    setFullScreenPath,
    closeFullScreen: () => setFullScreenHash(null),
    fileView,
    fileViewOpens,
    /** History or Blame as picked in the open file view. */
    setFileViewMode: (mode: FileViewMode): void => {
      fileViewMode.current = mode
    },
    closeFileView: () => setFileView(null),
    workingDiff,
    closeWorkingDiff: () => setWorkingDiff(null),
    activeFile,
    searchFocusToken,
    closeFileViews,
    showConflicts,
    goToWorkingChanges,
    resetForRepo,
    openFileView,
    openWorkingFile,
    openCommitFile,
    openCommitFromFileView,
    editFromFileView,
    navigateToCommit,
    fileViewDiff,
    handleClickCommit,
    toggleWorking,
    jumpToCommit,
    selectBranchCommit,
    showCommitInGraph,
    focusSearch
  }
}

export type MainView = ReturnType<typeof useMainView>
