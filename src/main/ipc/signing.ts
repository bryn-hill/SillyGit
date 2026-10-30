import { ipcMain } from 'electron'
import * as signing from '../signing'
import * as accounts from '../accounts'
import { addSshKey } from '../github'
import type { ConfigScope, SigningValues, SshKeyUsage } from '../../shared/signing'
import { wrap } from './wrap'

/** Commit signing settings and SSH keys (Settings > Signing and SSH keys). */
export function registerSigningHandlers(): void {
  ipcMain.handle('signing:get', (_e, repoPath: string | null) => wrap(() => signing.getSigningState(repoPath)))

  ipcMain.handle('signing:set', (_e, scope: ConfigScope, repoPath: string | null, values: Partial<SigningValues>) =>
    wrap(() => signing.setSigning(scope, repoPath, values))
  )

  ipcMain.handle('signing:clear-local', (_e, repoPath: string) => wrap(() => signing.clearLocalSigning(repoPath)))

  ipcMain.handle('signing:list-keys', () => wrap(() => signing.listSigningKeys()))

  ipcMain.handle('signing:generate-ssh-key', (_e, name: string, comment: string, passphrase: string) =>
    wrap(() => signing.generateSshKey(name, comment, passphrase))
  )

  ipcMain.handle('signing:trust-ssh-key', (_e, repoPath: string | null, publicKeyPath: string) =>
    wrap(() => signing.trustSshKey(repoPath, publicKeyPath))
  )

  ipcMain.handle('signing:test', (_e, repoPath: string) => wrap(() => signing.testSigning(repoPath)))

  ipcMain.handle('signing:export-gpg-key', (_e, id: string) => wrap(() => signing.exportGpgPublicKey(id)))

  ipcMain.handle(
    'signing:upload-ssh-key',
    (_e, accountId: string, publicKeyPath: string, title: string, usage: SshKeyUsage) =>
      wrap(async () => {
        const found = await accounts.credentialsById(accountId)
        if (!found || found.account.provider !== 'github') throw new Error('Sign in to a GitHub account first.')
        const key = await signing.sshKeyAt(publicKeyPath)
        await addSshKey(found.creds, title.trim() || 'SillyGit', key.publicKey, usage)
      })
  )
}
