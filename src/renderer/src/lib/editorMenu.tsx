import { createContext } from 'react'

/** What a file's right-click menu needs for "Open in <editor>". */
export interface EditorOpener {
  /** The editor's name, or null when none was found (the menu then leaves the item out). */
  name: string | null
  /** Opens `file`, relative to the repo, in the editor. */
  open: (file: string) => void
}

export const EditorContext = createContext<EditorOpener>({ name: null, open: () => {} })
