/**
 * Commit signing and SSH keys. SillyGit only writes git config and key files
 * under ~/.ssh (through ssh-keygen); private keys never go into its settings.
 */

/** git's gpg.format. x509 (gpgsm) is shown but not offered. */
export type SigningFormat = 'openpgp' | 'ssh' | 'x509'

/** Where a setting lives: ~/.gitconfig, or the repository's .git/config. */
export type ConfigScope = 'global' | 'local'

/** The signing settings at one scope; null means not set there. */
export interface SigningValues {
  format: SigningFormat | null
  /** user.signingkey: a GPG key id, or for SSH a key file (or `key::…` literal). */
  key: string | null
  /** commit.gpgsign */
  signCommits: boolean | null
  /** tag.gpgsign */
  signTags: boolean | null
}

export interface SigningState {
  global: SigningValues
  /** Null when no repository is open. */
  local: SigningValues | null
  /** What git uses in the open repository (or globally), local winning over global. */
  effective: { format: SigningFormat; key: string | null; signCommits: boolean; signTags: boolean }
  /** user.email, for the allowed signers file. */
  email: string | null
  /** gpg.ssh.allowedSignersFile, as configured. */
  allowedSignersFile: string | null
}

export interface SshKey {
  publicKeyPath: string
  /** The private half next to it, when there is one. */
  privateKeyPath: string | null
  /** e.g. ssh-ed25519 */
  type: string
  comment: string
  /** The whole public key line. */
  publicKey: string
  /** SHA256:… from ssh-keygen -l, when ssh-keygen is installed. */
  fingerprint: string | null
}

export interface GpgKey {
  /** The long key id, which is what user.signingkey takes. */
  id: string
  fingerprint: string
  /** The first user id, e.g. "Ada Lovelace <ada@example.com>". */
  userId: string
  /** Epoch seconds, or null when it never expires. */
  expires: number | null
}

export interface SigningKeys {
  ssh: SshKey[]
  gpg: GpgKey[]
  /** Why GPG keys couldn't be listed (gpg not installed…), or null. */
  gpgProblem: string | null
  /** Whether ssh-keygen was found, which signing with SSH and making keys need. */
  sshKeygen: boolean
  /** The home folder, for reading ~/ in user.signingkey. */
  home: string
}

export type SshKeyUsage = 'authentication' | 'signing'

export const EMPTY_VALUES: SigningValues = { format: null, key: null, signCommits: null, signTags: null }

const FORMATS: SigningFormat[] = ['openpgp', 'ssh', 'x509']

export function parseFormat(value: string | null): SigningFormat | null {
  const v = value?.trim().toLowerCase()
  return v && (FORMATS as string[]).includes(v) ? (v as SigningFormat) : null
}

/** git's boolean config spelling (true/yes/on/1, false/no/off/0), or null when unset or unreadable. */
export function parseGitBool(value: string | null): boolean | null {
  const v = value?.trim().toLowerCase()
  if (v === undefined || v === '') return null
  if (['true', 'yes', 'on', '1'].includes(v)) return true
  if (['false', 'no', 'off', '0'].includes(v)) return false
  return null
}

/** Local settings win over global ones, then git's defaults. */
export function effectiveSigning(global: SigningValues, local: SigningValues | null): SigningState['effective'] {
  const pick = <K extends keyof SigningValues>(k: K): SigningValues[K] => local?.[k] ?? global[k]
  return {
    format: pick('format') ?? 'openpgp',
    key: pick('key'),
    signCommits: pick('signCommits') ?? false,
    signTags: pick('signTags') ?? false
  }
}

const SSH_KEY_TYPE = /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp\d+|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)$/

/** Reads one public key line (`type base64 comment`), or null when it isn't one. */
export function parseSshPublicKey(text: string): { type: string; data: string; comment: string } | null {
  const line = text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#'))
  if (!line) return null
  const [type, data, ...rest] = line.trim().split(/\s+/)
  if (!type || !data || !SSH_KEY_TYPE.test(type) || !/^[A-Za-z0-9+/]+=*$/.test(data)) return null
  return { type, data, comment: rest.join(' ') }
}

/**
 * Reads `gpg --list-secret-keys --with-colons`: secret keys that can sign
 * and aren't expired, revoked or disabled.
 */
export function parseGpgSecretKeys(out: string): GpgKey[] {
  const keys: GpgKey[] = []
  let current: GpgKey | null = null
  let usable = false
  for (const line of out.split(/\r?\n/)) {
    const f = line.split(':')
    if (f[0] === 'sec') {
      if (current && usable) keys.push(current)
      const validity = f[1] ?? ''
      const caps = f[11] ?? ''
      // A capital S means the key, with its subkeys, can sign; D marks a disabled key.
      usable = !/[erdi]/.test(validity) && caps.includes('S') && !caps.includes('D')
      current = { id: f[4] ?? '', fingerprint: '', userId: '', expires: Number(f[6]) || null }
    } else if (current && f[0] === 'fpr' && !current.fingerprint) {
      current.fingerprint = f[9] ?? ''
    } else if (current && f[0] === 'uid' && !current.userId && !/[r]/.test(f[1] ?? '')) {
      current.userId = unescapeColons(f[9] ?? '')
    }
  }
  if (current && usable) keys.push(current)
  return keys.filter((k) => k.id)
}

// --with-colons escapes colons and other special bytes as \xHH.
function unescapeColons(text: string): string {
  return text.replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

/** The allowed signers line that lets git check your own SSH signatures. */
export function allowedSignersLine(email: string, publicKey: string): string | null {
  const key = parseSshPublicKey(publicKey)
  if (!key || !email.trim()) return null
  return `${email.trim()} namespaces="git" ${key.type} ${key.data}`
}

/** The allowed signers file with `line` added, or unchanged when that email already has that key. */
export function addAllowedSigner(file: string, line: string): string {
  const [email, , type, data] = line.split(' ')
  const has = file.split(/\r?\n/).some((l) => {
    const parts = l.trim().split(/\s+/)
    return parts[0] === email && parts.includes(type) && parts.includes(data)
  })
  if (has) return file
  return `${file}${file && !file.endsWith('\n') ? '\n' : ''}${line}\n`
}

/** A file name for a new key in ~/.ssh: letters, digits, dot, dash and underscore. */
export function isValidKeyName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.startsWith('.') && !name.endsWith('.pub')
}

/** Whether user.signingkey (a path, maybe ~/…, or `key::…`) names this SSH key. */
export function signingKeyMatches(configured: string | null, key: SshKey, home: string): boolean {
  if (!configured) return false
  const value = configured.trim()
  if (value.startsWith('key::')) {
    const literal = parseSshPublicKey(value.slice(5))
    const mine = parseSshPublicKey(key.publicKey)
    return !!literal && !!mine && literal.data === mine.data
  }
  const path = value.startsWith('~/') ? `${home}/${value.slice(2)}` : value
  const norm = (p: string): string => p.replace(/\\/g, '/')
  return norm(path) === norm(key.publicKeyPath) || (!!key.privateKeyPath && norm(path) === norm(key.privateKeyPath))
}
