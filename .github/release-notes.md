## Download

| System | File |
| --- | --- |
| macOS, Apple silicon (M1 and later) | `SillyGit-<version>-mac-arm64.dmg` |
| macOS, Intel | `SillyGit-<version>-mac-x64.dmg` |
| Windows 10/11, 64-bit | `SillyGit-<version>-win-x64.exe` (installer), or `SillyGit-<version>-win-x64.zip` (unzip anywhere and run `SillyGit.exe`) |
| Linux | Build from source with `npm run dist` (see the README) |

The `.zip` files for macOS hold the same app as the `.dmg`. `SHA256SUMS.txt` lists checksums for every file.

The macOS builds are signed and notarized by Apple, so they open normally. The Windows builds aren't signed yet, so Windows warns on first launch:

- **Windows:** if SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway**.

SillyGit needs Git installed. The Claude panel and AI review need a Claude account or an Anthropic API key (Settings > AI).
