import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { promises as fs } from 'fs'
import { PROVIDERS, normalizeHost, normalizeOrganization, type GitProvider, type NewAccountInput, type ProviderAccount } from '../shared/accounts'
import { gitAuthHeader, gitUsername, verifyAccount, type Credentials } from './providerApi'
import { downloadAsDataUrl } from './avatars'
import { gitConfigEnv } from './gitExec'

/**
 * Personal access tokens, kept in their own file next to the settings. Each
 * token is encrypted with Electron's safeStorage, which uses the macOS
 * Keychain, Windows DPAPI or the Linux secret service (libsecret / KWallet),
 * so the file never holds a token in readable form.
 */
interface StoredAccount extends ProviderAccount {
  /** The name git sends with the token over HTTPS. */
  gitUsername: string
  /** Bitbucket: the email or username the token was added with. */
  enteredUsername?: string
  organization?: string
  /** safeStorage-encrypted token, base64. */
  encryptedToken: string
}

interface AccountsFile {
  accounts: StoredAccount[]
}

let cached: StoredAccount[] | null = null

function accountsPath(): string {
  return join(app.getPath('userData'), 'sillygit-accounts.json')
}

async function readAccounts(): Promise<StoredAccount[]> {
  if (cached) return cached
  try {
    const parsed = JSON.parse(await fs.readFile(accountsPath(), 'utf-8')) as AccountsFile
    cached = Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    cached = []
  }
  return cached
}

async function writeAccounts(accounts: StoredAccount[]): Promise<void> {
  cached = accounts
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  const file: AccountsFile = { accounts }
  // Owner-only, like an SSH key; the tokens are encrypted anyway.
  await fs.writeFile(accountsPath(), JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

/** Why tokens can't be saved on this machine, or null when they can. */
export function encryptionProblem(): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return 'This system has no secure storage for passwords, so tokens can\'t be saved.'
  }
  // On Linux without a keyring Electron falls back to a fixed, built-in key,
  // which is no better than plain text.
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    return 'No keyring was found (GNOME Keyring or KWallet), so tokens can\'t be stored securely.'
  }
  return null
}

function toPublic(account: StoredAccount): ProviderAccount {
  const { id, provider, host, username, organization, displayName, avatar, emails, addedAt } = account
  return { id, provider, host, username, ...(organization ? { organization } : {}), displayName, avatar, emails, addedAt }
}

function credentialsOf(account: StoredAccount, token: string): Credentials {
  return {
    provider: account.provider,
    host: account.host,
    token,
    username: account.enteredUsername,
    ...(account.organization ? { organization: account.organization } : {})
  }
}

const sameOrganization = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export async function listAccounts(): Promise<ProviderAccount[]> {
  return (await readAccounts()).map(toPublic)
}

/** Checks the token with the service, then saves it encrypted. Replaces an earlier token for the same login. */
export async function addAccount(input: NewAccountInput): Promise<ProviderAccount> {
  const problem = encryptionProblem()
  if (problem) throw new Error(problem)

  const provider = input.provider
  const info = PROVIDERS[provider]
  if (!info) throw new Error(`Unknown service "${provider}".`)
  const host = info.hostEditable ? normalizeHost(input.host || info.defaultHost) : info.defaultHost
  if (!host) throw new Error(`Enter the server's address, e.g. ${info.hostPlaceholder ?? 'git.example.com'}.`)
  const token = input.token.trim()
  if (!token) throw new Error('Paste a token first.')
  const enteredUsername = input.username?.trim() || undefined
  if (info.needsUsername && !enteredUsername) throw new Error(`Enter the email of your ${info.label} account.`)
  const organization = info.needsOrganization ? normalizeOrganization(input.organization ?? '') : undefined
  if (info.needsOrganization && !organization) throw new Error(`Enter your ${info.label} organization.`)

  let verified
  try {
    verified = await verifyAccount({ provider, host, token, username: enteredUsername, organization })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${info.label} didn't accept the token (${message}).`)
  }

  const avatar = verified.avatarUrl
    ? await downloadAsDataUrl(verified.avatarUrl, verified.avatarHeaders).catch(() => null)
    : null
  const account: StoredAccount = {
    id: randomUUID(),
    provider,
    host,
    username: verified.username,
    ...(organization ? { organization } : {}),
    displayName: verified.displayName,
    avatar,
    emails: verified.emails,
    addedAt: new Date().toISOString(),
    gitUsername: gitUsername(provider, verified.username, enteredUsername),
    enteredUsername,
    encryptedToken: safeStorage.encryptString(token).toString('base64')
  }

  const others = (await readAccounts()).filter(
    (a) =>
      !(
        a.provider === provider &&
        a.host === host &&
        a.username === account.username &&
        sameOrganization(a.organization, organization)
      )
  )
  await writeAccounts([...others, account])
  return toPublic(account)
}

export async function removeAccount(id: string): Promise<ProviderAccount[]> {
  const remaining = (await readAccounts()).filter((a) => a.id !== id)
  await writeAccounts(remaining)
  return remaining.map(toPublic)
}

function decrypt(account: StoredAccount): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(account.encryptedToken, 'base64'))
  } catch {
    // Encrypted on another machine or by another user; it has to be added again.
    return null
  }
}

/** The account and its token for a host, when one is signed in. */
export async function credentialsFor(
  host: string,
  provider?: GitProvider
): Promise<{ account: ProviderAccount; creds: Credentials } | null> {
  const account = (await readAccounts()).find((a) => a.host === host && (!provider || a.provider === provider))
  if (!account) return null
  const token = decrypt(account)
  if (!token) return null
  return { account: toPublic(account), creds: credentialsOf(account, token) }
}

/** A signed-in account and its token, by the account's id. */
export async function credentialsById(id: string): Promise<{ account: ProviderAccount; creds: Credentials } | null> {
  const account = (await readAccounts()).find((a) => a.id === id)
  if (!account) return null
  const token = decrypt(account)
  return token ? { account: toPublic(account), creds: credentialsOf(account, token) } : null
}

/** The Azure DevOps account and token for an organization, when one is signed in. */
export async function azureCredentialsFor(
  organization: string
): Promise<{ account: ProviderAccount; creds: Credentials } | null> {
  const account = (await readAccounts()).find(
    (a) => a.provider === 'azure' && sameOrganization(a.organization, organization)
  )
  if (!account) return null
  const token = decrypt(account)
  return token ? { account: toPublic(account), creds: credentialsOf(account, token) } : null
}

/** Every signed-in account for a service, with its token. Accounts whose token can't be read are left out. */
export async function accountsWithCredentials(
  provider: GitProvider
): Promise<{ account: ProviderAccount; creds: Credentials }[]> {
  const found: { account: ProviderAccount; creds: Credentials }[] = []
  for (const account of await readAccounts()) {
    if (account.provider !== provider) continue
    const token = decrypt(account)
    if (!token) continue
    found.push({ account: toPublic(account), creds: credentialsOf(account, token) })
  }
  return found
}

/**
 * Git configuration, passed through the environment so tokens never show up
 * in a process list, that makes git send each account's token to its host
 * over HTTPS. git's own credential helpers still handle every other host.
 */
export async function gitAuthEnv(): Promise<Record<string, string>> {
  const entries: { key: string; value: string }[] = []
  const seen = new Set<string>()
  for (const account of await readAccounts()) {
    if (PROVIDERS[account.provider]?.issueTracker) continue
    // Azure DevOps hosts every organization on one host, so its tokens go by organization (git
    // matches http.<url> settings by path prefix), on dev.azure.com and the older visualstudio.com.
    const urls =
      account.provider === 'azure' && account.organization
        ? [
            ...[...new Set([account.organization, account.organization.toLowerCase()])].map(
              (org) => `https://${account.host}/${encodeURIComponent(org)}/`
            ),
            `https://${account.organization.toLowerCase()}.visualstudio.com/`
          ]
        : [`https://${account.host}/`]
    const fresh = urls.filter((url) => !seen.has(url))
    if (fresh.length === 0) continue
    const token = decrypt(account)
    if (!token) continue
    for (const url of fresh) {
      seen.add(url)
      entries.push({ key: `http.${url}.extraHeader`, value: gitAuthHeader(account.gitUsername, token) })
    }
  }
  return gitConfigEnv(entries)
}
