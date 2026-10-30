import { useState, type JSX } from 'react'
import Select from '../Select'
import { PLACEHOLDERS, SCOPE_LABELS, type CustomCommand, type CustomCommandScope } from '../../../../shared/customCommands'

const SCOPES = Object.entries(SCOPE_LABELS).map(([value, label]) => ({ value: value as CustomCommandScope, label }))

/** One command's row. Name and command are drafts, saved when the field loses focus. */
function CommandRow({
  command,
  onChange,
  onRemove
}: {
  command: CustomCommand
  onChange: (next: CustomCommand) => void
  onRemove: () => void
}): JSX.Element {
  const [name, setName] = useState(command.name)
  const [text, setText] = useState(command.command)
  const save = (): void => {
    if (name !== command.name || text !== command.command) onChange({ ...command, name, command: text })
  }
  return (
    <li className="custom-command-row">
      <input
        aria-label="Command name"
        placeholder="Name, e.g. Open on GitHub"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
      />
      <Select<CustomCommandScope>
        aria-label={`Where ${name || 'this command'} shows`}
        value={command.scope}
        options={SCOPES}
        onChange={(scope) => onChange({ ...command, name, command: text, scope })}
      />
      <button className="icon-button" aria-label={`Remove ${name || 'command'}`} title="Remove" onClick={onRemove}>
        ✕
      </button>
      <input
        aria-label="Shell command"
        className="settings-command custom-command-text"
        placeholder="gh browse $SHA"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </li>
  )
}

/** Settings for custom commands: shell commands offered in the right-click menus and the command palette. */
export default function CustomCommandsSection({
  commands,
  onChange
}: {
  commands: CustomCommand[]
  onChange: (next: CustomCommand[]) => void
}): JSX.Element {
  const add = (): void =>
    onChange([...commands, { id: `cmd-${Date.now().toString(36)}`, name: '', command: '', scope: 'repo' }])
  return (
    <section className="settings-section" aria-label="Custom commands">
      <span className="modal-label">Custom commands</span>
      {commands.length > 0 && (
        <ul className="custom-command-list">
          {commands.map((c) => (
            <CommandRow
              key={c.id}
              command={c}
              onChange={(next) => onChange(commands.map((x) => (x.id === c.id ? next : x)))}
              onRemove={() => onChange(commands.filter((x) => x.id !== c.id))}
            />
          ))}
        </ul>
      )}
      <button className="subtle custom-command-add" onClick={add}>
        + Add command
      </button>
      <div className="modal-hint">
        Commands run in the terminal from the repository folder. A Repository command is in the command palette;
        Commit, Branch and File commands are in those right-click menus. You can use{' '}
        {PLACEHOLDERS.map((p, i) => (
          <span key={p.name}>
            {i > 0 && (i === PLACEHOLDERS.length - 1 ? ' and ' : ', ')}
            <code>{p.name}</code> ({p.description})
          </span>
        ))}
        .
      </div>
    </section>
  )
}
