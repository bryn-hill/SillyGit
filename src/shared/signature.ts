/** Whether a commit is signed, and whether git could check the signature. */
export interface CommitSignature {
  status: 'verified' | 'unverified' | 'unsigned'
  /** git's `%G?` letter, e.g. "G" or "E". */
  code: string
  /** Who signed it (`%GS`), when git could tell. */
  signer?: string
  /** The signing key (`%GK`). */
  key?: string
  /** Why it isn't verified, or who verified it, for the badge's tooltip. */
  reason: string
}

const REASONS: Record<string, string> = {
  G: 'Good signature',
  U: 'Good signature from a key that isn’t trusted',
  X: 'Good signature, but it has expired',
  Y: 'Good signature from a key that has expired',
  R: 'Signed with a key that has been revoked',
  E: 'Signed, but the key isn’t available to check it',
  B: 'Bad signature: the commit doesn’t match it',
  N: 'Not signed'
}

/**
 * Reads `git log --format=%G?%x1f%GS%x1f%GK` for one commit. `signedWith` is
 * the kind of signature in the commit's own header, if any: git reports an
 * SSH signature it has no allowed signers file for as unsigned ("N"), when it
 * is really unchecked.
 */
export function parseSignature(out: string, signedWith: 'ssh' | 'gpg' | null = null): CommitSignature {
  const [rawCode = '', signer = '', key = ''] = out.replace(/\n+$/, '').split('\x1f')
  const code = rawCode.trim() || 'N'
  if (code === 'N' && signedWith) {
    return {
      status: 'unverified',
      code: 'E',
      reason:
        signedWith === 'ssh'
          ? 'Signed with SSH, but git can’t check it: set gpg.ssh.allowedSignersFile'
          : REASONS.E
    }
  }
  const status = code === 'G' ? 'verified' : code === 'N' ? 'unsigned' : 'unverified'
  const reason = REASONS[code] ?? 'Signed, but git couldn’t check it'
  return {
    status,
    code,
    ...(signer.trim() && { signer: signer.trim() }),
    ...(key.trim() && { key: key.trim() }),
    reason: signer.trim() && status === 'verified' ? `${reason} from ${signer.trim()}` : reason
  }
}
