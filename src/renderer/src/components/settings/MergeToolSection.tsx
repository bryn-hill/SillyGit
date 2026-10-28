import { useState, type JSX } from 'react'
import Select from '../Select'
import {
  MERGE_TOOL_PRESETS,
  mergeToolPreset,
  type MergeToolId,
  type MergeToolSettings
} from '../../../../shared/mergeTools'

export default function MergeToolSection({
  mergeTool,
  onChange
}: {
  mergeTool: MergeToolSettings
  onChange: (next: MergeToolSettings) => void
}): JSX.Element {
  // A draft, so the command isn't saved on every keystroke.
  const [command, setCommand] = useState(mergeTool.customCommand)
  // Take a saved command that changed elsewhere, while rendering rather than in an effect.
  const [savedCommand, setSavedCommand] = useState(mergeTool.customCommand)
  if (savedCommand !== mergeTool.customCommand) {
    setSavedCommand(mergeTool.customCommand)
    setCommand(mergeTool.customCommand)
  }
  const preset = mergeToolPreset(mergeTool.tool)
  return (
    <section className="settings-section" aria-label="Merge tool">
      <label className="modal-label" htmlFor="merge-tool">
        External merge tool
      </label>
      <Select<MergeToolId>
        id="merge-tool"
        value={mergeTool.tool}
        onChange={(tool) => onChange({ ...mergeTool, tool })}
        options={MERGE_TOOL_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
      />
      {mergeTool.tool === 'custom' && (
        <input
          aria-label="Merge tool command"
          className="settings-command"
          placeholder="mytool --merge $LOCAL $REMOTE $BASE -o $MERGED"
          value={command}
          spellCheck={false}
          onChange={(e) => setCommand(e.target.value)}
          onBlur={() => command !== mergeTool.customCommand && onChange({ ...mergeTool, customCommand: command })}
        />
      )}
      <div className="modal-hint">
        {mergeTool.tool === 'none'
          ? 'Conflicts open in the built-in merge tool only.'
          : mergeTool.tool === 'git'
            ? "Runs git mergetool with the tool from your git config's merge.tool."
            : mergeTool.tool === 'custom'
              ? '$LOCAL is the current side, $REMOTE the incoming side, $BASE the common ancestor and $MERGED the file to save.'
              : `Runs: ${preset?.command}`}{' '}
        {mergeTool.tool !== 'none' &&
          'Conflicted files get "Open in…" (also in the merge tool, or press ⌘D / Ctrl+D). Closing the tool with no conflict markers left marks the file resolved.'}
      </div>
    </section>
  )
}
