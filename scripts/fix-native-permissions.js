// npm's install pipeline can strip the executable bit from packaged native
// binaries (observed with node-pty's prebuilt spawn-helper on macOS/Linux),
// which makes terminal spawning fail with "posix_spawnp failed". Re-apply it.
const fs = require('fs')
const path = require('path')

if (process.platform === 'win32') process.exit(0)

const prebuildsRoot = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds')
if (!fs.existsSync(prebuildsRoot)) process.exit(0)

for (const platformDir of fs.readdirSync(prebuildsRoot)) {
  const helperPath = path.join(prebuildsRoot, platformDir, 'spawn-helper')
  if (fs.existsSync(helperPath)) fs.chmodSync(helperPath, 0o755)
}
