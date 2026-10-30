import { createContext, useContext } from 'react'
import { commandsFor, type CommandTarget, type CustomCommand, type CustomCommandScope } from '../../../shared/customCommands'
import type { ContextMenuItem } from '../components/ContextMenu'

/** What a right-click menu needs to offer the user's custom commands. */
export interface CustomCommandRunner {
  commands: CustomCommand[]
  /** Runs `command` on `target` in the terminal; the repo and current branch are filled in. */
  run: (command: CustomCommand, target: Omit<CommandTarget, 'repo' | 'currentBranch'>) => void
}

export const CustomCommandsContext = createContext<CustomCommandRunner>({ commands: [], run: () => {} })

/**
 * The menu items for the custom commands of `scopes`, run on `target`: one
 * "Custom commands" submenu, or nothing when there are none. Returns a
 * function, so menus built in event handlers can call it.
 */
export function useCustomCommandMenu(): (
  scopes: CustomCommandScope | CustomCommandScope[],
  target: Omit<CommandTarget, 'repo' | 'currentBranch'>
) => ContextMenuItem[] {
  const { commands, run } = useContext(CustomCommandsContext)
  return (scopes, target) => {
    const matching = [scopes].flat().flatMap((scope) => commandsFor(commands, scope))
    if (matching.length === 0) return []
    return [
      {
        id: 'custom-commands',
        label: 'Custom commands',
        submenu: matching.map((c) => ({ id: `custom-${c.id}`, label: c.name, title: c.command, onSelect: () => run(c, target) }))
      }
    ]
  }
}
