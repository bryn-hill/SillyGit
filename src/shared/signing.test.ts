import { describe, expect, it } from 'vitest'
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
  signingKeyMatches,
  type SshKey
} from './signing'

const ED25519 = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'

describe('parseSshPublicKey', () => {
  it('reads the type, key and comment', () => {
    expect(parseSshPublicKey(`${ED25519} ada@example.com laptop\n`)).toEqual({
      type: 'ssh-ed25519',
      data: ED25519.split(' ')[1],
      comment: 'ada@example.com laptop'
    })
  })

  it('takes security keys and ECDSA', () => {
    expect(parseSshPublicKey('sk-ssh-ed25519@openssh.com AAAA x')?.type).toBe('sk-ssh-ed25519@openssh.com')
    expect(parseSshPublicKey('ecdsa-sha2-nistp256 AAAA=')?.comment).toBe('')
  })

  it('rejects anything else', () => {
    expect(parseSshPublicKey('-----BEGIN OPENSSH PRIVATE KEY-----')).toBeNull()
    expect(parseSshPublicKey('')).toBeNull()
    expect(parseSshPublicKey('ssh-ed25519 not*base64')).toBeNull()
  })
})

describe('parseGpgSecretKeys', () => {
  const out = [
    'sec:u:255:22:AAAA1111BBBB2222:1700000000:::u:::scESC:::+:::ed25519:::0:',
    'fpr:::::::::0123456789ABCDEF0123AAAA1111BBBB2222:',
    'grp:::::::::ABC:',
    'uid:u::::1700000000::HASH::Ada Lovelace <ada@example.com>::::::::::0:',
    'uid:r::::1700000000::HASH::Old \\x3a name::::::::::0:',
    'ssb:u:255:18:CCCC3333DDDD4444:1700000000::::::e:::+:::cv25519::',
    'fpr:::::::::FFFFFFFFFFFFFFFFFFFFCCCC3333DDDD4444:',
    'sec:e:255:22:EEEE5555FFFF6666:1600000000:1650000000::u:::scESC:::+:::ed25519:::0:',
    'uid:e::::1600000000::HASH::Expired <old@example.com>::::::::::0:',
    'sec:u:3072:1:9999888877776666:1700000000:1900000000::u:::eE:::+:::::0:',
    'uid:u::::1700000000::HASH::Encrypt only <enc@example.com>::::::::::0:'
  ].join('\n')

  it('lists usable signing keys with their first uid and primary fingerprint', () => {
    expect(parseGpgSecretKeys(out)).toEqual([
      {
        id: 'AAAA1111BBBB2222',
        fingerprint: '0123456789ABCDEF0123AAAA1111BBBB2222',
        userId: 'Ada Lovelace <ada@example.com>',
        expires: null
      }
    ])
  })

  it('unescapes colons in user ids', () => {
    const keys = parseGpgSecretKeys('sec:u:255:22:ABCDABCDABCDABCD:1:1900000000::u:::scS:\nuid:u::::1::H::A \\x3a B::')
    expect(keys[0]).toMatchObject({ userId: 'A : B', expires: 1900000000 })
  })
})

describe('config values', () => {
  it('reads git booleans and formats', () => {
    expect(parseGitBool('Yes')).toBe(true)
    expect(parseGitBool('off')).toBe(false)
    expect(parseGitBool(null)).toBeNull()
    expect(parseFormat('SSH')).toBe('ssh')
    expect(parseFormat('nonsense')).toBeNull()
  })

  it('lets local settings win, then git defaults', () => {
    const global = { format: 'ssh' as const, key: '~/.ssh/id', signCommits: true, signTags: null }
    expect(effectiveSigning(global, { ...EMPTY_VALUES, signCommits: false })).toEqual({
      format: 'ssh',
      key: '~/.ssh/id',
      signCommits: false,
      signTags: false
    })
    expect(effectiveSigning(EMPTY_VALUES, null).format).toBe('openpgp')
  })
})

describe('allowed signers', () => {
  it('pairs the email with the key for git', () => {
    expect(allowedSignersLine(' ada@example.com ', `${ED25519} c`)).toBe(`ada@example.com namespaces="git" ${ED25519}`)
    expect(allowedSignersLine('', ED25519)).toBeNull()
  })

  it('adds a line once', () => {
    const line = allowedSignersLine('ada@example.com', ED25519)!
    const once = addAllowedSigner('bob@example.com ssh-rsa AAAA', line)
    expect(once).toBe(`bob@example.com ssh-rsa AAAA\n${line}\n`)
    expect(addAllowedSigner(once, line)).toBe(once)
  })
})

describe('keys', () => {
  const key: SshKey = {
    publicKeyPath: '/home/ada/.ssh/id_ed25519.pub',
    privateKeyPath: '/home/ada/.ssh/id_ed25519',
    type: 'ssh-ed25519',
    comment: '',
    publicKey: ED25519,
    fingerprint: null
  }

  it('matches user.signingkey by path, ~ path or literal key', () => {
    expect(signingKeyMatches('/home/ada/.ssh/id_ed25519', key, '/home/ada')).toBe(true)
    expect(signingKeyMatches('~/.ssh/id_ed25519.pub', key, '/home/ada')).toBe(true)
    expect(signingKeyMatches(`key::${ED25519}`, key, '/home/ada')).toBe(true)
    expect(signingKeyMatches('~/.ssh/other', key, '/home/ada')).toBe(false)
    expect(signingKeyMatches(null, key, '/home/ada')).toBe(false)
  })

  it('only takes plain file names for new keys', () => {
    expect(isValidKeyName('id_ed25519_work')).toBe(true)
    expect(isValidKeyName('../id')).toBe(false)
    expect(isValidKeyName('.hidden')).toBe(false)
    expect(isValidKeyName('id.pub')).toBe(false)
  })
})
