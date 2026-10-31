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

The workflow signs as soon as these repository secrets exist (Settings > Secrets and variables >
Actions). Leave them unset for unsigned builds.

| Secret | What it is |
| --- | --- |
| `MAC_CSC_LINK` | Developer ID Application certificate as a base64 `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Its password |
| `MAC_IDENTITY` | The certificate's name, e.g. `Bryn Hill (ABCDE12345)` |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Turn on notarization |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code signing certificate (`.pfx`, base64) |

With `MAC_CSC_LINK` set, the macOS step overrides the ad hoc identity with `MAC_IDENTITY` and
turns on the hardened runtime, and with `APPLE_ID` set it also notarizes. Signed builds no longer
need the right-click workaround, so drop that part of `.github/release-notes.md` too.

## Windows installer

electron-builder needs wine to make an NSIS installer anywhere but Windows. Without it the
workflow ships only the portable zip. To add the installer, install wine on the runner Mac
(`brew install --cask wine-stable`); the workflow notices and builds the `.exe` as well.

## Self-update

The in-app **Update SillyGit** button only works in a source checkout (it pulls `main` and
rebuilds) and is turned off in packaged builds. People who download a release update by
downloading the next one.
