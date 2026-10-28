import { shell, ipcMain, clipboard } from 'electron'
import { wrap } from './wrap'

/** The clipboard, and opening folders and links outside SillyGit. */
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
}
