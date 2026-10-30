import { app, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fsp } from 'fs'
import * as accounts from '../accounts'
import * as github from '../github'
import * as hostedRepos from '../hostedRepos'
import { forgetJiraSites } from '../jira'
import * as settings from '../settings'
import { AvatarResolver, type AvatarSources } from '../avatars'
import { azureAccess, githubAccess, remoteLocations } from '../hosting'
import { azureAvatarFor } from '../azure'
import { gitlabAvatarUrl } from '../providerApi'
import { guessProvider, type NewAccountInput } from '../../shared/accounts'
import type { AvatarRequest } from '../../shared/types'
import type { PublishInput } from '../../shared/hostedRepos'
import claudeLogo from '../../../resources/bots/claude.png?asset'
import renovateLogo from '../../../resources/bots/renovate.png?asset'
import { restartPrNotifications } from './notifications'
import { wrap } from './wrap'

let avatarResolver: AvatarResolver | null = null
let botLogos: Promise<AvatarSources['bots']> | null = null

/** The bundled Claude and Renovate logos, read once. */
function loadBotLogos(): Promise<AvatarSources['bots']> {
  const read = (file: string): Promise<string> =>
    fsp.readFile(file).then((data) => `data:image/png;base64,${data.toString('base64')}`)
  botLogos ??= Promise.all([read(claudeLogo), read(renovateLogo)])
    .then(([claude, renovate]) => ({ claude, renovate }))
    .catch(() => ({}))
  return botLogos
}

/** What the avatar lookup may use for a repo: signed-in accounts, its GitHub or GitLab remotes, Gravatar. */
async function avatarSources(repoPath: string): Promise<AvatarSources> {
  const signedIn = await accounts.listAccounts()
  const access = await githubAccess(repoPath).catch(() => null)
  const azure = await azureAccess(repoPath).catch(() => null)
  // A host counts as GitLab when its signed-in account says so, or by name when none is.
  const isGitlab = (host: string): boolean => {
    const account = signedIn.find((a) => a.host === host)
    return account ? account.provider === 'gitlab' : guessProvider(host) === 'gitlab'
  }
  const gitlabHosts = [...new Set((await remoteLocations(repoPath)).map((l) => l.host).filter(isGitlab))]
  return {
    accounts: signedIn,
    bots: await loadBotLogos(),
    githubLookup: access ? (commits) => github.commitAuthorAvatars(access.creds, access.repo, commits) : undefined,
    gitlabLookup:
      gitlabHosts.length > 0
        ? async (email) => {
            for (const host of gitlabHosts) {
              const creds = (await accounts.credentialsFor(host, 'gitlab'))?.creds
              const url = await gitlabAvatarUrl(host, email, creds)
              if (url) return url
            }
            return null
          }
        : undefined,
    gravatar: true,
    // A token that can't search the directory just means no Azure DevOps pictures.
    azureLookup: azure
      ? (email) => azureAvatarFor(azure.creds, azure.repo.organization, email).catch(() => null)
      : undefined
  }
}

/** Signed-in hosting accounts (tokens kept with safeStorage), and commit author avatars. */
export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:list', () => wrap(() => accounts.listAccounts()))

  ipcMain.handle('accounts:storage-problem', () => accounts.encryptionProblem())

  ipcMain.handle('accounts:add', (_e, input: NewAccountInput) =>
    wrap(async () => {
      const account = await accounts.addAccount(input)
      await avatarResolver?.forgetMisses()
      forgetJiraSites()
      void restartPrNotifications()
      return account
    })
  )

  ipcMain.handle('accounts:remove', (_e, id: string) =>
    wrap(() => {
      forgetJiraSites()
      return accounts.removeAccount(id)
    })
  )

  ipcMain.handle('accounts:repos', (_e, accountId?: string) => wrap(() => hostedRepos.listHostedRepos(accountId)))

  ipcMain.handle('accounts:publish-owners', (_e, accountId: string) => wrap(() => hostedRepos.publishOwners(accountId)))

  ipcMain.handle('repo:publish', (_e, repoPath: string, input: PublishInput) =>
    wrap(() => hostedRepos.publishRepo(repoPath, input))
  )

  ipcMain.handle('settings:get-show-avatars', () => settings.getShowAvatars())

  ipcMain.handle('settings:set-show-avatars', (_e, show: boolean) => wrap(() => settings.setShowAvatars(show)))

  ipcMain.handle('avatars:resolve', (_e, repoPath: string, requests: AvatarRequest[]) =>
    wrap(async () => {
      if (!(await settings.getShowAvatars())) return {}
      avatarResolver ??= new AvatarResolver(join(app.getPath('userData'), 'avatar-cache'))
      return avatarResolver.resolve(requests, await avatarSources(repoPath))
    })
  )
}
