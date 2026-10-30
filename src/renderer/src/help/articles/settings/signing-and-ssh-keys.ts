import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/signing-and-ssh-keys',
  title: 'Sign commits and manage SSH keys',
  category: 'settings',
  summary: 'Turn on commit signing with a GPG or SSH key, make an SSH key, and add it to GitHub.',
  keywords: [
    'sign',
    'signing',
    'signature',
    'gpg',
    'pgp',
    'ssh',
    'ssh key',
    'ssh-keygen',
    'verified',
    'unverified',
    'gpgsign',
    'signingkey',
    'allowed signers',
    'ed25519'
  ],
  related: ['graph/commit-details', 'integrations/accounts', 'settings/settings-overview'],
  body: `## Commit signing

Open **Settings** and find **Commit signing**. Pick where the settings go first:

- **All repositories** writes to your \`~/.gitconfig\`, so the git command line and other apps sign the same way.
- **This repository** writes to the open repository's \`.git/config\` and overrides the global settings there. **Use global settings** removes the repository's own ones again.

Then:

- **Sign every commit** sets \`commit.gpgsign\`. **Sign annotated tags** sets \`tag.gpgsign\`.
- **Sign with** picks GPG or an SSH key (\`gpg.format\`).
- **Key** lists your GPG secret keys, or the SSH keys in \`~/.ssh\` (\`user.signingkey\`). With GPG and no key picked, gpg uses the key for your committer email.

**Test signing** signs a throwaway commit with the repository's settings and tells you whether it worked, without changing any branch. If a key has a passphrase, gpg or ssh-agent asks for it the way it does on the command line.

## Getting commits marked Verified

Commit details show **Verified**, **Unverified** or **Unsigned** for each commit.

- **SSH**: git can only check SSH signatures against an *allowed signers* file. Click **Verify my SSH signatures** to add your email and key to \`~/.ssh/allowed_signers\` and point \`gpg.ssh.allowedSignersFile\` at it. GitHub shows the commit as Verified once you add the key there as a **signing** key (see below).
- **GPG**: click **Copy public key** and paste it into your Git host's GPG keys page.

## SSH keys

**SSH keys** lists the public keys in \`~/.ssh\`. **Copy** copies one to paste anywhere.

**Generate a new key…** makes an Ed25519 key with ssh-keygen. Give it a file name, a comment (usually your email) and, ideally, a passphrase. The private key stays in \`~/.ssh\`: SillyGit never copies it or saves it in its settings. With a passphrase, add the key to ssh-agent so git can use it without asking each time; on a Mac, \`ssh-add --apple-use-keychain ~/.ssh/id_ed25519\` keeps the passphrase in the Keychain.

**Add to GitHub** uploads a public key to a signed-in GitHub account, for pushing and pulling over SSH, for signing, or both. The account's token needs extra access for this: a classic token needs the \`write:public_key\` and \`write:ssh_signing_key\` scopes; a fine-grained token needs the **Git SSH keys** and **SSH signing keys** account permissions. If the token lacks them, SillyGit says so; make a new token with them and add the account again.

## Example

You want GitHub to show your commits as Verified. In Settings, click **Generate a new key…**, keep the name \`id_ed25519\`, and add a passphrase. When it's made, **Add to GitHub** opens with both boxes ticked; click **Add key**. Under **Commit signing**, tick **Sign every commit**, set **Sign with** to SSH key and pick \`id_ed25519\`. Click **Verify my SSH signatures**, then **Test signing**. Your next commit is signed, and both SillyGit and GitHub mark it Verified.`
}

export default article
