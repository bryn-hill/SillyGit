import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fsp } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { runGit, runGitWithInput } from './gitExec'
import { findExecutable } from './executables'
import {
  EMPTY_VALUES,
  addAllowedSigner,
  allowedSignersLine,
  effectiveSigning,
  isValidKeyName,
  parseFormat,
  parseGitBool,
  parseGpgSecretKeys,
  parseSshPublicKey,
  type ConfigScope,
  type GpgKey,
  type SigningKeys,
  type SigningState,
  type SigningValues,
  type SshKey
} from '../shared/signing'

const execFileAsync = promisify(execFile)

const CONFIG_KEYS: Record<keyof SigningValues, string> = {
  format: 'gpg.format',
  key: 'user.signingkey',
  signCommits: 'commit.gpgsign',
  signTags: 'tag.gpgsign'
}

const SSH_KEYGEN_FALLBACKS = [
  'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe',
  'C:\\Program Files\\Git\\usr\\bin\\ssh-keygen.exe'
]
const GPG_FALLBACKS = [
  '/usr/local/MacGPG2/bin/gpg',
  'C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe',
  'C:\\Program Files\\GnuPG\\bin\\gpg.exe',
  'C:\\Program Files\\Git\\usr\\bin\\gpg.exe'
]

export function sshDir(): string {
  return join(homedir(), '.ssh')
}

/** Global settings are read from the home folder when no repository is open. */
function cwdFor(scope: ConfigScope, repoPath: string | null): string {
  if (scope === 'local' && !repoPath) throw new Error('Open a repository to change its signing settings.')
  return repoPath ?? homedir()
}

async function configGet(cwd: string, scope: ConfigScope | null, key: string): Promise<string | null> {
  try {
    const args = scope ? ['config', `--${scope}`, '--get', key] : ['config', '--get', key]
    return (await runGit(cwd, args)).trim() || null
  } catch {
    // Exit 1: not set.
    return null
  }
}

async function readValues(cwd: string, scope: ConfigScope): Promise<SigningValues> {
  const [format, key, signCommits, signTags] = await Promise.all(
    Object.values(CONFIG_KEYS).map((k) => configGet(cwd, scope, k))
  )
  return {
    format: parseFormat(format),
    key,
    signCommits: parseGitBool(signCommits),
    signTags: parseGitBool(signTags)
  }
}

export async function getSigningState(repoPath: string | null): Promise<SigningState> {
  const cwd = repoPath ?? homedir()
  const [global, local, email, allowedSignersFile] = await Promise.all([
    readValues(cwd, 'global'),
    repoPath ? readValues(repoPath, 'local') : Promise.resolve(null),
    configGet(cwd, null, 'user.email'),
    configGet(cwd, null, 'gpg.ssh.allowedSignersFile')
  ])
  return { global, local, effective: effectiveSigning(global, local), email, allowedSignersFile }
}

async function configSet(cwd: string, scope: ConfigScope, key: string, value: string | null): Promise<void> {
  if (value !== null) {
    await runGit(cwd, ['config', `--${scope}`, key, value])
    return
  }
  // --unset-all fails when there's nothing to unset.
  if ((await configGet(cwd, scope, key)) !== null) await runGit(cwd, ['config', `--${scope}`, '--unset-all', key])
}

/** Sets (or, for null, removes) signing settings at one scope. Keys left out are unchanged. */
export async function setSigning(
  scope: ConfigScope,
  repoPath: string | null,
  values: Partial<SigningValues>
): Promise<SigningState> {
  const cwd = cwdFor(scope, repoPath)
  for (const [name, configKey] of Object.entries(CONFIG_KEYS) as [keyof SigningValues, string][]) {
    if (!(name in values)) continue
    const v = values[name]
    await configSet(cwd, scope, configKey, v === null || v === undefined ? null : String(v))
  }
  return getSigningState(repoPath)
}

/** Removes the repository's own signing settings so the global ones apply. */
export function clearLocalSigning(repoPath: string): Promise<SigningState> {
  return setSigning('local', repoPath, EMPTY_VALUES)
}

async function sshKeygen(): Promise<string | null> {
  return findExecutable('ssh-keygen', SSH_KEYGEN_FALLBACKS)
}

async function gpgProgram(): Promise<string | null> {
  const configured = await configGet(homedir(), null, 'gpg.program')
  return (
    (configured && (await findExecutable(configured))) ||
    (await findExecutable('gpg', GPG_FALLBACKS)) ||
    (await findExecutable('gpg2'))
  )
}

async function fingerprint(keygen: string | null, publicKeyPath: string): Promise<string | null> {
  if (!keygen) return null
  try {
    const { stdout } = await execFileAsync(keygen, ['-l', '-f', publicKeyPath])
    return stdout.trim().split(/\s+/)[1] ?? null
  } catch {
    return null
  }
}

async function readSshKey(publicKeyPath: string, keygen: string | null): Promise<SshKey | null> {
  let text: string
  try {
    text = await fsp.readFile(publicKeyPath, 'utf8')
  } catch {
    return null
  }
  const parsed = parseSshPublicKey(text)
  if (!parsed) return null
  const privatePath = publicKeyPath.slice(0, -'.pub'.length)
  const hasPrivate = await fsp
    .stat(privatePath)
    .then((s) => s.isFile())
    .catch(() => false)
  return {
    publicKeyPath,
    privateKeyPath: hasPrivate ? privatePath : null,
    type: parsed.type,
    comment: parsed.comment,
    publicKey: `${parsed.type} ${parsed.data}${parsed.comment ? ` ${parsed.comment}` : ''}`,
    fingerprint: await fingerprint(keygen, publicKeyPath)
  }
}

export async function listSshKeys(): Promise<SshKey[]> {
  let names: string[]
  try {
    names = await fsp.readdir(sshDir())
  } catch {
    return []
  }
  const keygen = await sshKeygen()
  const keys = await Promise.all(
    names.filter((n) => n.endsWith('.pub')).sort().map((n) => readSshKey(join(sshDir(), n), keygen))
  )
  return keys.filter((k): k is SshKey => !!k)
}

async function listGpgKeys(): Promise<{ keys: GpgKey[]; problem: string | null }> {
  const gpg = await gpgProgram()
  if (!gpg) return { keys: [], problem: 'GnuPG (gpg) isn’t installed.' }
  try {
    const { stdout } = await execFileAsync(gpg, ['--list-secret-keys', '--with-colons'], { timeout: 10000 })
    return { keys: parseGpgSecretKeys(stdout), problem: null }
  } catch (err) {
    return { keys: [], problem: `gpg couldn’t list keys: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function listSigningKeys(): Promise<SigningKeys> {
  const [ssh, gpg, keygen] = await Promise.all([listSshKeys(), listGpgKeys(), sshKeygen()])
  return { ssh, gpg: gpg.keys, gpgProblem: gpg.problem, sshKeygen: !!keygen, home: homedir() }
}

/**
 * Makes an Ed25519 key pair in ~/.ssh with ssh-keygen. ssh-keygen only takes
 * a passphrase on its command line or a terminal, so a passphrase is briefly
 * visible to other processes of this user while it runs.
 */
export async function generateSshKey(name: string, comment: string, passphrase: string): Promise<SshKey> {
  if (!isValidKeyName(name)) throw new Error('Use letters, digits, dots, dashes and underscores for the file name.')
  const keygen = await sshKeygen()
  if (!keygen) throw new Error('ssh-keygen wasn’t found. Install OpenSSH and try again.')
  await fsp.mkdir(sshDir(), { recursive: true, mode: 0o700 })
  const path = join(sshDir(), name)
  for (const file of [name, `${name}.pub`]) {
    const exists = await fsp.stat(join(sshDir(), file)).then(
      () => true,
      () => false
    )
    if (exists) throw new Error(`~/.ssh/${file} already exists. Pick another name.`)
  }
  try {
    await execFileAsync(keygen, ['-q', '-t', 'ed25519', '-C', comment, '-N', passphrase, '-f', path])
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw new Error(`ssh-keygen failed: ${stderr || (err instanceof Error ? err.message : String(err))}`)
  }
  const key = await readSshKey(`${path}.pub`, keygen)
  if (!key) throw new Error('ssh-keygen didn’t write a public key.')
  return key
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

/**
 * Adds your email and this SSH key to the allowed signers file, so git can
 * check your own SSH-signed commits, and points gpg.ssh.allowedSignersFile at
 * it when nothing was set. Returns the file's path.
 */
export async function trustSshKey(repoPath: string | null, publicKeyPath: string): Promise<string> {
  const state = await getSigningState(repoPath)
  if (!state.email) throw new Error('Set user.email first: the allowed signers file pairs it with the key.')
  const key = await sshKeyAt(publicKeyPath)
  const line = allowedSignersLine(state.email, key.publicKey)
  if (!line) throw new Error('That isn’t an SSH public key.')
  const file = state.allowedSignersFile ? expandHome(state.allowedSignersFile) : join(sshDir(), 'allowed_signers')
  const existing = await fsp.readFile(file, 'utf8').catch(() => '')
  const next = addAllowedSigner(existing, line)
  if (next !== existing) {
    await fsp.mkdir(join(file, '..'), { recursive: true, mode: 0o700 })
    await fsp.writeFile(file, next, 'utf8')
  }
  if (!state.allowedSignersFile) {
    await configSet(homedir(), 'global', 'gpg.ssh.allowedSignersFile', file)
  }
  return file
}

/**
 * Signs a throwaway commit object with the repository's settings, the way a
 * real commit would be signed. Nothing points at it, so git's gc removes it.
 */
export async function testSigning(repoPath: string): Promise<string> {
  try {
    const tree = (await runGitWithInput(repoPath, ['mktree'], '')).toString('utf8').trim()
    await runGitWithInput(repoPath, ['commit-tree', '-S', '-m', 'SillyGit signing test', tree], '')
  } catch (err) {
    throw new Error(`Signing failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const { effective } = await getSigningState(repoPath)
  const what = { ssh: 'SSH key', x509: 'X.509 certificate', openpgp: 'GPG key' }[effective.format]
  return `Signed with your ${what}.`
}

/** The ASCII-armored public key for a GPG key id, for pasting into a Git host. */
export async function exportGpgPublicKey(id: string): Promise<string> {
  if (!/^[0-9A-Fa-f]{8,40}$/.test(id)) throw new Error('Not a GPG key id.')
  const gpg = await gpgProgram()
  if (!gpg) throw new Error('GnuPG (gpg) isn’t installed.')
  const { stdout } = await execFileAsync(gpg, ['--armor', '--export', id], { timeout: 10000 })
  if (!stdout.trim()) throw new Error(`gpg has no public key for ${id}.`)
  return stdout
}

/** Only keys found in ~/.ssh may be read or uploaded. */
export async function sshKeyAt(publicKeyPath: string): Promise<SshKey> {
  const key = (await listSshKeys()).find((k) => k.publicKeyPath === publicKeyPath)
  if (!key) throw new Error('That key isn’t in ~/.ssh any more.')
  return key
}
