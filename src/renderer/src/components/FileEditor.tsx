import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { EditableFile } from '../../../shared/types'
import { monaco } from '../lib/monaco'

interface Props {
  repoPath: string
  path: string
  /** Unsaved text from the last time this file was open, restored on top of the file on disk. */
  draft?: string
  /** Reports unsaved text when the editor goes away (a tab switch, Launchpad), or null when there is none. */
  onDraftChange: (draft: string | null) => void
  onClose: () => void
  /** Called after each save, so the working-tree status can refresh. */
  onSaved: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Edits one working-tree file in Monaco, in place of the commit graph. */
export default function FileEditor({ repoPath, path, draft, onDraftChange, onClose, onSaved }: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const savedVersion = useRef(0)
  const [file, setFile] = useState<EditableFile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [language, setLanguage] = useState('')
  const [eol, setEol] = useState('LF')

  useEffect(() => {
    let cancelled = false
    window.api.readEditableFile(repoPath, path).then((res) => {
      if (cancelled) return
      if (res.ok) setFile(res.data)
      else setLoadError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, path])

  const save = useCallback(async (): Promise<void> => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    const version = model.getAlternativeVersionId()
    setSaving(true)
    setSaveError(null)
    // getValue() keeps the file's own line endings.
    const res = await window.api.writeFile(repoPath, path, model.getValue())
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return
    }
    savedVersion.current = version
    setDirty(model.getAlternativeVersionId() !== version)
    setSavedFlash(true)
    onSaved()
  }, [repoPath, path, onSaved])

  const saveRef = useRef(save)
  saveRef.current = save
  const onDraftChangeRef = useRef(onDraftChange)
  onDraftChangeRef.current = onDraftChange
  const draftRef = useRef(draft)
  const closing = useRef(false)

  const requestClose = useCallback((): void => {
    if (dirty && !window.confirm(`Discard unsaved changes to ${path}?`)) return
    closing.current = true
    onDraftChangeRef.current(null)
    onClose()
  }, [dirty, path, onClose])

  const content = file?.kind === 'text' ? file.content : null
  const absolutePath = file?.absolutePath

  useEffect(() => {
    if (content == null || !absolutePath || !containerRef.current) return
    const uri = monaco.Uri.file(absolutePath)
    monaco.editor.getModel(uri)?.dispose()
    const model = monaco.editor.createModel(content, undefined, uri)
    const editor = monaco.editor.create(containerRef.current, {
      model,
      theme: 'sillygit-dracula',
      automaticLayout: true,
      fontFamily: "'SF Mono', Menlo, ui-monospace, monospace",
      fontSize: 12.5,
      lineHeight: 19,
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      fixedOverflowWidgets: true,
      'semanticHighlighting.enabled': false
    })
    editorRef.current = editor
    savedVersion.current = model.getAlternativeVersionId()
    // Bring back edits left unsaved when the editor was last hidden.
    const restored = draftRef.current
    if (restored != null && restored !== content) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: restored }], () => null)
      setDirty(true)
    }
    setLanguage(monaco.languages.getLanguages().find((l) => l.id === model.getLanguageId())?.aliases?.[0] ?? model.getLanguageId())
    setEol(model.getEOL() === '\r\n' ? 'CRLF' : 'LF')

    const subs = [
      model.onDidChangeContent(() => {
        setDirty(model.getAlternativeVersionId() !== savedVersion.current)
        setSavedFlash(false)
      }),
      editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }))
    ]
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveRef.current())
    editor.focus()

    return () => {
      if (!closing.current) {
        const unsaved = model.getAlternativeVersionId() !== savedVersion.current
        onDraftChangeRef.current(unsaved ? model.getValue() : null)
      }
      subs.forEach((s) => s.dispose())
      editor.dispose()
      model.dispose()
      editorRef.current = null
    }
  }, [content, absolutePath])

  // Pick up changes made on disk elsewhere (a branch switch, another editor),
  // but never over unsaved edits.
  useEffect(() => {
    if (dirty || content == null) return
    const onFocus = (): void => {
      window.api.readEditableFile(repoPath, path).then((res) => {
        const model = editorRef.current?.getModel()
        if (!res.ok || res.data.kind !== 'text' || !model) return
        if (model.getAlternativeVersionId() !== savedVersion.current) return
        if (res.data.content === model.getValue()) return
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: res.data.content }], () => null)
        savedVersion.current = model.getAlternativeVersionId()
        setDirty(false)
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [dirty, content, repoPath, path])

  // Keep typing in the editor away from the app's global shortcuts (graph
  // arrows, Cmd+K, Esc closing the diff view underneath). Monaco's own
  // keybindings run on its nodes first.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape' && !root.querySelector('.monaco-editor')?.contains(e.target as Node)) requestClose()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    root.addEventListener('keydown', onKey)
    return () => root.removeEventListener('keydown', onKey)
  }, [requestClose])

  useEffect(() => {
    if (!savedFlash) return
    const t = setTimeout(() => setSavedFlash(false), 2000)
    return () => clearTimeout(t)
  }, [savedFlash])

  const openExternally = async (): Promise<void> => {
    if (!absolutePath) return
    const res = await window.api.openPath(absolutePath)
    if (!res.ok) setSaveError(res.error)
  }

  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = path.slice(slash + 1)

  let placeholder: string | null = null
  if (loadError) placeholder = `Unable to open ${path}: ${loadError}`
  else if (!file) placeholder = 'Loading…'
  else if (file.kind === 'missing') placeholder = `${path} doesn't exist in the working directory.`
  else if (file.kind === 'binary') placeholder = `${name} is a binary file (${formatSize(file.size)}) and can't be edited here.`
  else if (file.kind === 'too-large') placeholder = `${name} is too large to edit here (${formatSize(file.size)}).`

  return (
    <div ref={rootRef} className="file-editor" role="region" aria-label="Edit file">
      <div className="file-editor-toolbar">
        <span className="file-editor-title" title={path}>
          <span className="file-editor-dir">{dir}</span>
          <span className="file-editor-name">{name}</span>
        </span>
        {dirty && (
          <span className="file-editor-dirty" aria-label="Unsaved changes" title="Unsaved changes">
            ●
          </span>
        )}
        <span className="merge-toolbar-spacer" />
        {file?.kind === 'text' && <span className="file-editor-language">{language}</span>}
        {file && file.kind !== 'missing' && (
          <button className="icon-button" onClick={openExternally} title="Open in external editor" aria-label="Open in external editor">
            ↗
          </button>
        )}
        {file?.kind === 'text' && (
          <button className="merge-save-button" disabled={!dirty || saving} onClick={() => void save()} title="Save (⌘S)">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        <button className="icon-button" title="Close" aria-label="Close editor" onClick={requestClose}>
          ✕
        </button>
      </div>
      {placeholder ? (
        <div className="commit-fullview-empty">{placeholder}</div>
      ) : (
        <div ref={containerRef} className="file-editor-monaco" data-testid="file-editor-monaco" />
      )}
      <div className="file-editor-status">
        {saveError ? (
          <span className="file-editor-error" role="alert">
            {saveError}
          </span>
        ) : (
          <span role="status">{savedFlash ? 'Saved' : dirty ? 'Unsaved changes' : ''}</span>
        )}
        <span className="merge-toolbar-spacer" />
        {file?.kind === 'text' && (
          <span>
            Ln {cursor.line}, Col {cursor.column} · {eol} · UTF-8
          </span>
        )}
      </div>
    </div>
  )
}
