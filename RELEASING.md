# Releasing SillyGit

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) on the
self-hosted Mac runner and published at
[github.com/bryn-hill/sillygit/releases](https://github.com/bryn-hill/sillygit/releases). The
newest one is always at
[releases/latest](https://github.com/bryn-hill/sillygit/releases/latest).

## What gets built

| File | For |
| --- | --- |
| `SillyGit-<version>-mac-arm64.dmg` / `.zip` | macOS on Apple silicon |
| `SillyGit-<version>-mac-x64.dmg` / `.zip` | macOS on Intel |
| `SillyGit-<version>-win-x64.zip` | Windows 10/11, 64-bit (portable: unzip and run `SillyGit.exe`) |
| `SillyGit-<version>-win-x64.exe` | Windows NSIS installer, only when the runner has wine (see below) |
| `SHA256SUMS.txt` | Checksums for all of the above |

Linux isn't built by the workflow: node-pty has no Linux prebuilds, so it has to be compiled on
Linux, and the only runner is a Mac. On Linux, `npm run dist` makes an AppImage.

Each build carries only its own platform's Claude binary: the Agent SDK installs the binary for
the machine npm runs on, so `scripts/release-sdk-binary.mjs <platform> <arch>` swaps it before
each target is packaged.

## Cutting a release

Releases come from `main`, after `dev` has been promoted to it.

1. Bump `version` in `package.json` (and the lockfile) on `dev`, with a commit like
   `chore(release): 0.2.0`, and get it to `main`.
2. Tag `main` and push the tag:

   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

The tag starts the workflow. It checks that the tag matches `package.json`, runs typecheck, lint
and unit tests, packages every target, and publishes the release with generated notes plus the
download table from [`.github/release-notes.md`](.github/release-notes.md) (with `<version>` filled in). Assets go onto a draft
first, so a release only appears once every file is uploaded. It takes 15 to 25 minutes.

You can also run it from **Actions > Release > Run workflow**, picking the branch and typing the
tag. If the tag doesn't exist yet it's created at that branch's tip. (GitHub only offers manual
runs for workflows that are on the default branch, `main`.)

Rerunning a release, or running it for a tag whose release already exists (one drafted by hand
in the GitHub UI, say), replaces its assets rather than failing.

## Unsigned builds

Nothing is signed with a paid certificate yet, so people see a warning on first launch. The
release notes tell them how to get past it:

- **macOS** builds are ad hoc signed (`identity: '-'` in `electron-builder.yml`) and not
  notarized. Right-click the app, choose **Open**, then **Open** again. If macOS calls the app
  damaged, use **System Settings > Privacy & Security > Open Anyway**, or run
  `xattr -dr com.apple.quarantine /Applications/SillyGit.app`.
- **Windows** builds trigger SmartScreen: **More info > Run anyway**.

## Code signing

macOS builds are signed with a Developer ID Application certificate that
[Fastlane Match](https://docs.fastlane.tools/actions/match/) keeps, encrypted, in a private git
repo (`bryn-hill/sillygit-certificates`, set in `fastlane/Matchfile`). On each release the
workflow runs `fastlane mac ci_keychain`, which decrypts the certificate into a throwaway keychain
on the runner; electron-builder signs from it with the hardened runtime, notarizes with an App
Store Connect API key, and the keychain is deleted at the end. Until the `MATCH_PASSWORD` secret
exists, builds stay ad hoc signed.

### Setting it up

1. **Apple Developer Program.** A paid membership (individual is fine). Developer ID certificates
   can only be made by the account holder.
2. **Certificates repo.** Create an empty **private** repo, `bryn-hill/sillygit-certificates`.
   It must never be public: anyone with it and `MATCH_PASSWORD` can sign as you.
3. **App Store Connect API key.** In App Store Connect, **Users and Access > Integrations > App
   Store Connect API > Team Keys**, generate a key with the **Admin** role. Download the
   `AuthKey_<id>.p8` file (Apple only lets you download it once) and note the key ID and the
   issuer ID shown above the list.
4. **Create the certificate**, on a Mac with this repo cloned and Ruby from Homebrew
   (`brew install ruby`, then put `/opt/homebrew/opt/ruby/bin` first on your `PATH`):

   ```sh
   bundle install
   export APPLE_API_KEY=~/Downloads/AuthKey_ABC123XYZ.p8 APPLE_API_KEY_ID=ABC123XYZ APPLE_API_ISSUER=<issuer id>
   bundle exec fastlane mac certificates
   ```

   Match asks for a passphrase: that's `MATCH_PASSWORD`, so keep it in your password manager. It
   then creates the certificate and pushes it, encrypted, to the certificates repo.

   Apple refuses to create a Developer ID certificate through the API ("can only be performed by
   the Account Holder"), so in practice make it by hand. Don't use Xcode's Manage Certificates
   button: it makes a cloud-managed certificate whose private key stays with Apple, which Match
   can't store. Instead:

   ```sh
   openssl genrsa -out devid.key 2048
   openssl req -new -key devid.key -out devid.certSigningRequest -subj "/CN=Bryn Hill/C=GB"
   ```

   Upload the request at developer.apple.com > Certificates > + > **Developer ID Application**
   (G2 Sub-CA) and download the `.cer`. Build the `.p12` with macOS's `security` tool rather than
   OpenSSL 3+, whose `.p12` files macOS rejects ("MAC verification failed"): import the key and
   certificate into a temporary keychain and `security export -t identities -f pkcs12` from it.
   Then load both into Match with `bundle exec fastlane match import` (it prompts for the paths),
   and delete the key, the `.p12` and the request.

5. **Read-only token for the runner.** Make a fine-grained personal access token with access to
   only `sillygit-certificates` and **Contents: Read-only**. The secret below is
   `printf 'bryn-hill:<token>' | base64`.
6. **Repository secrets** (Settings > Secrets and variables > Actions):

   | Secret | What it is |
   | --- | --- |
   | `MATCH_PASSWORD` | The Match passphrase from step 4. Turns signing on. |
   | `MATCH_GIT_BASIC_AUTHORIZATION` | The base64 token from step 5 |
   | `APPLE_API_KEY_P8` | The whole contents of the `.p8` file. Turns notarization on. |
   | `APPLE_API_KEY_ID` | The key ID |
   | `APPLE_API_ISSUER` | The issuer ID |
   | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code signing certificate (`.pfx`, base64), if there ever is one |

7. **Runner.** The runner Mac needs Homebrew's Ruby (`brew install ruby`;
   `scripts/bootstrap-mac.sh` installs it). The workflow installs Fastlane itself, into
   `~/.cache/sillygit-release/bundle`.

Signed and notarized builds no longer need the right-click workaround, so once a signed release
is out, drop the macOS part of "Unsigned builds" above and of `.github/release-notes.md`.

The certificate lasts five years. To replace it, run `bundle exec fastlane mac certificates`
again once it has expired (or been revoked) and Match makes a new one.

## Windows installer

electron-builder needs wine to make an NSIS installer anywhere but Windows. Without it the
workflow ships only the portable zip. To add the installer, install wine on the runner Mac
(`brew install --cask wine-stable`); the workflow notices and builds the `.exe` as well.

## Self-update

The in-app **Update SillyGit** button only works in a source checkout (it pulls `main` and
rebuilds) and is turned off in packaged builds. People who download a release update by
downloading the next one.
