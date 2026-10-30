import { describe, expect, it } from 'vitest'
import { parseSignature } from './signature'

describe('parseSignature', () => {
  it('calls a good signature verified, naming the signer', () => {
    expect(parseSignature('G\x1fAda <ada@example.com>\x1fABC123\n')).toEqual({
      status: 'verified',
      code: 'G',
      signer: 'Ada <ada@example.com>',
      key: 'ABC123',
      reason: 'Good signature from Ada <ada@example.com>'
    })
  })

  it('calls an unsigned commit unsigned', () => {
    expect(parseSignature('N\x1f\x1f\n')).toEqual({ status: 'unsigned', code: 'N', reason: 'Not signed' })
    expect(parseSignature('')).toMatchObject({ status: 'unsigned', code: 'N' })
  })

  it('calls every other signature unverified, with the reason', () => {
    for (const code of ['B', 'U', 'X', 'Y', 'R', 'E']) {
      expect(parseSignature(`${code}\x1f\x1fKEY`).status).toBe('unverified')
    }
    expect(parseSignature('E\x1f\x1fKEY').reason).toMatch(/key isn’t available/)
    expect(parseSignature('B\x1f\x1fKEY').reason).toMatch(/Bad signature/)
    expect(parseSignature('?\x1f\x1f').reason).toMatch(/couldn’t check/)
  })
})

describe('parseSignature with a signature header git reported as none', () => {
  it('calls it unverified, with a hint for SSH', () => {
    expect(parseSignature('N\x1f\x1f', 'ssh')).toMatchObject({ status: 'unverified', reason: expect.stringContaining('allowedSignersFile') })
    expect(parseSignature('N\x1f\x1f', 'gpg')).toMatchObject({ status: 'unverified', code: 'E' })
  })
})
