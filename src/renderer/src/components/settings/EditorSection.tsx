import { useState, type JSX } from 'react'
import Select from '../Select'
import { MOD } from '../../lib/shortcuts'
import { chosenEditor, type EditorId, type EditorSettings, type InstalledEditor } from '../../../../shared/editors'

export default function EditorSection({
  editor,
  installed,
  onChange,
  onRescan
}: {
  editor: EditorSettings
  /** The editors found on this machine. */
  installed: InstalledEditor[]
  onChange: (next: EditorSettings) => void
  onRescan: () => void
}): JSX.Element {
  // A draft, so the command isn't saved on every keystroke.
  const [command, setCommand] = useState(editor.customCommand)
  // Take a saved command that changed elsewhere, while rendering rather than in an effect.
  const [savedCommand, setSavedCommand] = useState(editor.customCommand)
  if (savedCommand !== editor.customCommand) {
    setSavedCommand(editor.customCommand)
    setCommand(editor.customCommand)
  }
  const current = editor.editor === 'custom' ? 'custom' : (chosenEditor(editor, installed)?.id ?? 'custom')
  return (
    <section className="settings-section" aria-label="Editor">
      <label className="modal-label" htmlFor="editor">
        Open in editor
      </label>
      <Select<EditorId>
        id="editor"
        value={current}
        onChange={(id) => onChange({ ...editor, editor: id })}
        options={[
          ...installed.map((e) => ({ value: e.id, label: e.name })),
          { value: 'custom' as const, label: 'Other (custom command)' }
        ]}
      />
      {current === 'custom' && (
        <input
          aria-label="Editor command"
          className="settings-command"
          placeholder="nvim-qt $PATH"
          value={command}
          spellCheck={false}
          onChange={(e) => setCommand(e.target.value)}
          onBlur={() =>
            command !== editor.customCommand && onChange({ ...editor, editor: 'custom', customCommand: command })
          }
        />
      )}
      <div className="modal-hint">
        {current === 'custom'
          ? '$PATH is the repository folder, or the file when opening one; $REPO is always the repository. '
          : `The toolbar’s editor button (${MOD}⇧A) opens the repository in it, and files’ right-click menus open just that file. `}
        {installed.length > 0
          ? `Found ${installed.map((e) => e.name).join(', ')}.`
          : 'No code editors or IDEs were found.'}{' '}
        <button className="link-button" onClick={onRescan}>
          Look again
        </button>
      </div>
    </section>
  )
}
