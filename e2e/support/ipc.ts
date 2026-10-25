import type { ElectronApplication } from '@playwright/test'

/**
 * Replaces a main-process `ipcMain.handle` channel with one that always
 * resolves to `result`. Use it to keep tests off paid or networked services.
 */
export async function stubIpc(app: ElectronApplication, channel: string, result: unknown): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, { channel, result }) => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => result)
    },
    { channel, result }
  )
}
