import { useEffect, useState, type JSX } from 'react'
import Select from '../Select'
import type { ProviderAccount } from '../../../../shared/accounts'
import {
  signingKeyMatches,
  type ConfigScope,
  type SigningFormat,
  type SigningKeys,
  type SigningState,
  type SigningValues,
  type SshKey,
  type SshKeyUsage
} from '../../../../shared/signing'

const FORMAT_LABELS: Record<SigningFormat, string> = { openpgp: 'GPG', ssh: 'SSH key', x509: 'X.509 (gpgsm)' }

type Area = 'signing' | 'ssh'

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** user.signingkey for an SSH key: the private key file, which also works through ssh-agent. */
const sshKeyValue = (key: SshKey): string => key.privateKeyPath ?? key.publicKeyPath

/** A file name in ~/.ssh that isn't taken yet. */
function freeKeyName(keys: SshKey[]): string {
  const taken = new Set(keys.map((k) => fileName(k.publicKeyPath).replace(/\.pub$/, '')))
  if (!taken.has('id_ed25519')) return 'id_ed25519'
  let n = 1
  while (taken.has(`id_ed25519_sillygit${n === 1 ? '' : n}`)) n++
  return `id_ed25519_sillygit${n === 1 ? '' : n}`
}

function GenerateKeyForm({
  defaultName,
  defaultComment,
  onDone,
  onCancel
}: {
  defaultName: string
  defaultComment: string
  onDone: (key: SshKey) => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(defaultName)
  const [comment, setComment] = useState(defaultComment)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mismatch = passphrase !== confirm

  const submit = async (): Promise<void> => {
    if (mismatch || !name.trim()) return
    setBusy(true)
    setError(null)
    const res = await window.api.generateSshKey(name.trim(), comment.trim(), passphrase)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(res.data)
  }

  return (
    <form
      className="account-form"
      aria-label="Generate SSH key"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="modal-label" htmlFor="ssh-key-name">
        File name in ~/.ssh
      </label>
      <input id="ssh-key-name" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="modal-label" htmlFor="ssh-key-comment">
        Comment
      </label>
      <input
        id="ssh-key-comment"
        spellCheck={false}
        placeholder="you@example.com"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <label className="modal-label" htmlFor="ssh-key-passphrase">
        Passphrase (optional)
      </label>
      <input
        id="ssh-key-passphrase"
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      <input
        aria-label="Repeat passphrase"
        type="password"
        autoComplete="new-password"
        placeholder="Repeat passphrase"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <div className="modal-hint">
        Makes an Ed25519 key with ssh-keygen. The private key stays in ~/.ssh; SillyGit never copies it. With a
        passphrase, add the key to ssh-agent (on a Mac, <code>ssh-add --apple-use-keychain</code>) so git can sign
        without asking.
      </div>
      {mismatch && confirm && <div className="modal-error">The passphrases don&apos;t match.</div>}
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      <div className="account-form-actions">
        <button type="button" className="subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="commit-button" disabled={busy || mismatch || !name.trim()}>
          {busy ? 'Generating…' : 'Generate key'}
        </button>
      </div>
    </form>
  )
}

function UploadKeyForm({
  sshKey,
  accounts,
  onDone,
  onCancel
}: {
  sshKey: SshKey
  accounts: ProviderAccount[]
  onDone: (message: string) => void
  onCancel: () => void
}): JSX.Element {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [title, setTitle] = useState(`SillyGit ${fileName(sshKey.publicKeyPath)}`)
  const [usage, setUsage] = useState<Record<SshKeyUsage, boolean>>({ authentication: true, signing: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = (Object.keys(usage) as SshKeyUsage[]).filter((u) => usage[u])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    for (const u of chosen) {
      const res = await window.api.uploadSshKey(accountId, sshKey.publicKeyPath, title, u)
      if (!res.ok) {
        setBusy(false)
        setError(res.error)
        return
      }
    }
    setBusy(false)
    const account = accounts.find((a) => a.id === accountId)
    onDone(`Added ${fileName(sshKey.publicKeyPath)} to ${account?.username ?? 'GitHub'} on ${account?.host ?? 'GitHub'}.`)
  }

  return (
    <form
      className="account-form"
      aria-label="Add key to GitHub"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="modal-label">Add {fileName(sshKey.publicKeyPath)} to GitHub</div>
      {accounts.length > 1 && (
        <Select
          aria-label="GitHub account"
          value={accountId}
          onChange={setAccountId}
          options={accounts.map((a) => ({ value: a.id, label: `${a.username} (${a.host})` }))}
        />
      )}
      <label className="modal-label" htmlFor="ssh-key-title">
        Title on GitHub
      </label>
      <input id="ssh-key-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={usage.authentication}
          onChange={(e) => setUsage({ ...usage, authentication: e.target.checked })}
        />
        For pushing and pulling over SSH
      </label>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={usage.signing}
          onChange={(e) => setUsage({ ...usage, signing: e.target.checked })}
        />
        For signing commits (shows them as Verified)
      </label>
      <div className="modal-hint">
        A classic token needs the write:public_key and write:ssh_signing_key scopes; a fine-grained token needs the
        &quot;Git SSH keys&quot; and &quot;SSH signing keys&quot; account permissions.
      </div>
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      <div className="account-form-actions">
        <button type="button" className="subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="commit-button" disabled={busy || !accountId || chosen.length === 0}>
          {busy ? 'Adding…' : 'Add key'}
        </button>
      </div>
    </form>
  )
}

/** Settings > Commit signing, and SSH keys: git config for signing, and key files in ~/.ssh. */
export default function SigningSection({ repoPath }: { repoPath: string | null }): JSX.Element {
  const [state, setState] = useState<SigningState | null>(null)
  const [keys, setKeys] = useState<SigningKeys | null>(null)
  const [github, setGithub] = useState<ProviderAccount[]>([])
  const [scope, setScope] = useState<ConfigScope>('global')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [statusArea, setStatusArea] = useState<Area>('signing')
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState<SshKey | null>(null)

  useEffect(() => {
    window.api.getSigning(repoPath).then((res) => (res.ok ? setState(res.data) : setError(res.error)))
    window.api.listSigningKeys().then((res) => res.ok && setKeys(res.data))
    window.api.listAccounts().then((res) => res.ok && setGithub(res.data.filter((a) => a.provider === 'github')))
  }, [repoPath])

  const reloadKeys = async (): Promise<void> => {
    const res = await window.api.listSigningKeys()
    if (res.ok) setKeys(res.data)
  }

  /** Runs one action, showing its error or success line under `area`. */
  const run = async <T,>(
    area: Area,
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    done?: (data: T) => void
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    setStatusArea(area)
    const res = await action()
    setBusy(false)
    if (!res.ok) setError(res.error)
    else done?.(res.data)
  }

  const save = (values: Partial<SigningValues>): Promise<void> =>
    run('signing', () => window.api.setSigning(scope, repoPath, values), setState)

  if (!state) {
    return (
      <section className="settings-section" aria-label="Commit signing">
        <div className="modal-label">Commit signing</div>
        {error ? <div className="modal-error">{error}</div> : <div className="modal-hint">Reading git config…</div>}
      </section>
    )
  }

  const status = (
    <>
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="modal-saved">{notice}</div>}
    </>
  )
  const values = scope === 'local' && state.local ? state.local : state.global
  const inherited = scope === 'local' ? state.global : null
  const format = values.format ?? inherited?.format ?? 'openpgp'
  const key = values.key ?? inherited?.key ?? null
  const signCommits = values.signCommits ?? inherited?.signCommits ?? false
  const signTags = values.signTags ?? inherited?.signTags ?? false
  const localSet = !!state.local && Object.values(state.local).some((v) => v !== null)
  const home = keys?.home ?? ''
  const sshKeys = keys?.ssh ?? []
  const signingSsh = sshKeys.find((k) => signingKeyMatches(key, k, home)) ?? null
  const fromGlobal = (k: keyof SigningValues): string =>
    inherited && values[k] === null && inherited[k] !== null ? ' (from global)' : ''

  const keyOptions: { value: string; label: string }[] = [
    { value: '', label: format === 'ssh' ? 'Choose a key' : 'Your committer email’s key' }
  ]
  if (format === 'ssh') {
    for (const k of sshKeys) {
      if (!k.privateKeyPath) continue
      keyOptions.push({ value: sshKeyValue(k), label: `${fileName(k.publicKeyPath)} (${k.type.replace(/^ssh-/, '')})` })
    }
  } else if (format === 'openpgp') {
    for (const k of keys?.gpg ?? []) keyOptions.push({ value: k.id, label: `${k.userId || k.id} · ${k.id.slice(-8)}` })
  }
  const keyValue = format === 'ssh' && signingSsh?.privateKeyPath ? sshKeyValue(signingSsh) : (key ?? '')
  if (keyValue && !keyOptions.some((o) => o.value === keyValue)) keyOptions.push({ value: keyValue, label: keyValue })

  // x509 is only listed when it's already set, as SillyGit can't list its certificates.
  const formats: SigningFormat[] = format === 'x509' ? ['openpgp', 'ssh', 'x509'] : ['openpgp', 'ssh']

  const chooseFormat = (next: SigningFormat): void => {
    // The other format's key means nothing to this one, so pick the first that fits.
    const firstSsh = sshKeys.find((k) => k.privateKeyPath)
    const nextKey =
      next === 'ssh' ? (firstSsh ? sshKeyValue(firstSsh) : null) : next === 'openpgp' ? (keys?.gpg[0]?.id ?? null) : null
    void save({ format: next, key: nextKey })
  }

  return (
    <>
      <section className="settings-section signing-section" aria-label="Commit signing">
        <div className="modal-label">Commit signing</div>
        <div className="account-provider-tabs" role="radiogroup" aria-label="Signing settings for">
          {(['global', 'local'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              className={scope === s ? 'active' : ''}
              disabled={s === 'local' && !repoPath}
              title={s === 'local' && !repoPath ? 'Open a repository first' : undefined}
              onClick={() => setScope(s)}
            >
              {s === 'global' ? 'All repositories' : 'This repository'}
            </button>
          ))}
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={signCommits}
            disabled={busy}
            onChange={(e) => void save({ signCommits: e.target.checked })}
          />
          Sign every commit{fromGlobal('signCommits')}
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={signTags}
            disabled={busy}
            onChange={(e) => void save({ signTags: e.target.checked })}
          />
          Sign annotated tags{fromGlobal('signTags')}
        </label>
        <div className="signing-grid">
          <label className="modal-label" htmlFor="signing-format">
            Sign with{fromGlobal('format')}
          </label>
          <Select<SigningFormat>
            id="signing-format"
            value={format}
            disabled={busy}
            onChange={chooseFormat}
            options={formats.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
          />
          <label className="modal-label" htmlFor="signing-key">
            Key{fromGlobal('key')}
          </label>
          <Select<string>
            id="signing-key"
            value={keyValue}
            disabled={busy || format === 'x509'}
            onChange={(v) => void save({ key: v || null })}
            options={keyOptions}
          />
        </div>
        {format === 'openpgp' && keys?.gpgProblem && <div className="modal-hint">{keys.gpgProblem}</div>}
        {format === 'openpgp' && keys && !keys.gpgProblem && keys.gpg.length === 0 && (
          <div className="modal-hint">
            No GPG secret keys found. Make one with gpg --full-generate-key, or sign with an SSH key.
          </div>
        )}
        {format === 'ssh' && sshKeys.every((k) => !k.privateKeyPath) && (
          <div className="modal-hint">No SSH keys in ~/.ssh yet. Generate one below.</div>
        )}
        {format === 'ssh' && !state.allowedSignersFile && (
          <div className="modal-hint">
            git can&apos;t check SSH signatures until it has an allowed signers file, so your commits show as
            Unverified in SillyGit.
          </div>
        )}
        <div className="signing-actions">
          {repoPath && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={() => void run('signing', () => window.api.testSigning(repoPath), setNotice)}
            >
              Test signing
            </button>
          )}
          {format === 'ssh' && signingSsh && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              title="Adds your email and this key to the allowed signers file, so git can check your signatures"
              onClick={() =>
                void run(
                  'signing',
                  () => window.api.trustSshKey(repoPath, signingSsh.publicKeyPath),
                  (file) => {
                    setNotice(`Added to ${file}. git now checks your SSH-signed commits.`)
                    void window.api.getSigning(repoPath).then((res) => res.ok && setState(res.data))
                  }
                )
              }
            >
              Verify my SSH signatures
            </button>
          )}
          {format === 'openpgp' && key && /^[0-9A-Fa-f]{8,40}$/.test(key) && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={() =>
                void run(
                  'signing',
                  () => window.api.exportGpgPublicKey(key),
                  (armored) => {
                    void window.api.copyToClipboard(armored)
                    setNotice('Public key copied. Paste it into your Git host’s GPG keys page.')
                  }
                )
              }
            >
              Copy public key
            </button>
          )}
          {scope === 'local' && localSet && repoPath && (
            <button
              type="button"
              className="subtle"
              disabled={busy}
              onClick={() => void run('signing', () => window.api.clearLocalSigning(repoPath), setState)}
            >
              Use global settings
            </button>
          )}
        </div>
        <div className="modal-hint">
          {scope === 'global'
            ? 'Saved in your ~/.gitconfig, so the git command line and other apps sign the same way.'
            : 'Saved in this repository’s .git/config; it overrides your global settings here.'}
        </div>
        {statusArea === 'signing' && status}
      </section>

      <section className="settings-section" aria-label="SSH keys">
        <div className="modal-label">SSH keys</div>
        {sshKeys.length > 0 ? (
          <ul className="account-list">
            {sshKeys.map((k) => (
              <li key={k.publicKeyPath} className="account-row">
                <div className="account-row-text">
                  <div className="account-row-name">
                    {fileName(k.publicKeyPath)} <span className="signing-key-type">{k.type}</span>
                  </div>
                  <div className="modal-hint signing-key-detail" title={k.fingerprint ?? undefined}>
                    {k.comment || 'no comment'}
                    {k.fingerprint && ` · ${k.fingerprint}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="subtle"
                  onClick={() => {
                    void window.api.copyToClipboard(k.publicKey)
                    setStatusArea('ssh')
                    setError(null)
                    setNotice(`Copied ${fileName(k.publicKeyPath)}.`)
                  }}
                >
                  Copy
                </button>
                {github.length > 0 && (
                  <button type="button" className="subtle" onClick={() => setUploading(k)}>
                    Add to GitHub
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="modal-hint">{keys ? 'No SSH keys in ~/.ssh.' : 'Looking for SSH keys…'}</div>
        )}
        {uploading && (
          <UploadKeyForm
            key={uploading.publicKeyPath}
            sshKey={uploading}
            accounts={github}
            onCancel={() => setUploading(null)}
            onDone={(message) => {
              setUploading(null)
              setStatusArea('ssh')
              setNotice(message)
            }}
          />
        )}
        {generating ? (
          <GenerateKeyForm
            defaultName={freeKeyName(sshKeys)}
            defaultComment={state.email ?? ''}
            onCancel={() => setGenerating(false)}
            onDone={(created) => {
              setGenerating(false)
              setStatusArea('ssh')
              setNotice(`Made ${created.publicKeyPath}.`)
              void reloadKeys()
              if (github.length > 0) setUploading(created)
            }}
          />
        ) : (
          <div className="signing-actions">
            <button
              type="button"
              className="subtle"
              disabled={keys?.sshKeygen === false}
              title={keys?.sshKeygen === false ? 'ssh-keygen wasn’t found' : undefined}
              onClick={() => setGenerating(true)}
            >
              Generate a new key…
            </button>
          </div>
        )}
        {github.length === 0 && (
          <div className="modal-hint">Add a GitHub account above to upload keys to it from here.</div>
        )}
        {statusArea === 'ssh' && status}
      </section>
    </>
  )
}
