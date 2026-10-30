import { shell, ipcMain, clipboard } from 'electron'
import { wrap } from './wrap'
import { listEditors, openInEditor } from '../editors'
import type { EditorId } from '../../shared/editors'

/** The clipboard, and opening folders, links and code editors outside SillyGit. */
export function registerSystemHandlers(): void {
  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('shell:open-path', (_e, absolutePath: string) =>
    wrap(async () => {
      const result = await shell.openPath(absolutePath)
      if (result) throw new Error(result)
    })
  )

  ipcMain.handle('shell:open-external', (_e, url: string) =>
    wrap(async () => {
      if (!url.startsWith('https://')) throw new Error('Refusing to open a non-https URL.')
      await shell.openExternal(url)
    })
  )

  ipcMain.handle('editor:list', (_e, rescan?: boolean) => listEditors(rescan))

  ipcMain.handle('editor:open', (_e, repoPath: string, editor: EditorId, file?: string) =>
    wrap(() => openInEditor(repoPath, editor, file))
  )
}
