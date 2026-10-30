import { useEffect, useState } from 'react'
import { chosenEditor, type EditorSettings, type InstalledEditor } from '../../../shared/editors'

const NONE_FOUND: InstalledEditor[] = []

/**
 * "Open in <editor>": the code editors and IDEs installed here, the one the
 * toolbar button opens (picked in its menu or Settings, else the first one
 * found), and opening the repo or a file in it.
 */
export function useEditor({
  repoPath,
  settings,
  onChange,
  showError
}: {
  repoPath: string | null
  settings: EditorSettings
  onChange: (next: EditorSettings) => void
  showError: (message: string) => void
}) {
  const [installed, setInstalled] = useState(NONE_FOUND)
  useEffect(() => {
    void window.api.listEditors().then(setInstalled)
  }, [])
  const current = chosenEditor(settings, installed)

  /** Opens the repo, or `file` (relative to it), in `editor` (the current one by default). */
  const open = (file?: string, editor = current): void => {
    if (!repoPath) return
    if (!editor) {
      showError('No code editor was found. Choose one, or set a command for yours, in Settings under "Open in editor".')
      return
    }
    void window.api.openInEditor(repoPath, editor.id, file).then((res) => !res.ok && showError(res.error))
  }

  /** Makes `editor` the one the toolbar opens, and opens the repo in it. */
  const choose = (editor: InstalledEditor): void => {
    onChange({ ...settings, editor: editor.id })
    open(undefined, editor)
  }

  const rescan = (): void => {
    void window.api.listEditors(true).then(setInstalled)
  }

  return { installed, current, open, choose, rescan }
}

export type Editor = ReturnType<typeof useEditor>
