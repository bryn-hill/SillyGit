## Download

| System | File |
| --- | --- |
| macOS, Apple silicon (M1 and later) | `SillyGit-<version>-mac-arm64.dmg` |
| macOS, Intel | `SillyGit-<version>-mac-x64.dmg` |
| Windows 10/11, 64-bit | `SillyGit-<version>-win-x64.zip` (unzip anywhere and run `SillyGit.exe`) |
| Linux | Build from source with `npm run dist` (see the README) |

The `.zip` files for macOS hold the same app as the `.dmg`. `SHA256SUMS.txt` lists checksums for every file.

These builds aren't signed with a paid certificate yet, so your system will warn on first launch:

- **macOS:** drag SillyGit to Applications, then right-click it and choose **Open**, then **Open** again. If macOS says the app is damaged or offers no Open button, go to System Settings > Privacy & Security and click **Open Anyway**, or run `xattr -dr com.apple.quarantine /Applications/SillyGit.app`.
- **Windows:** if SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway**.

SillyGit needs Git installed. The Claude panel and AI review need a Claude account or an Anthropic API key (Settings > AI).
