// In dev (`npm run dev` / `npm start`) macOS runs the stock Electron.app from
// node_modules, so the dock, app menu and Cmd+Tab say "Electron" and show the
// Electron icon. Rename that bundle to SillyGit and give it our icon, then
// re-sign it ad hoc because editing Info.plist breaks Electron's signature.
// Packaged builds get the name and icon from electron-builder instead.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

if (process.platform !== 'darwin') process.exit(0)

const NAME = 'SillyGit'
const root = path.join(__dirname, '..')
const appPath = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = path.join(appPath, 'Contents', 'Info.plist')
const icns = path.join(appPath, 'Contents', 'Resources', 'electron.icns')
const iconPng = path.join(root, 'resources', 'icon.png')
if (!fs.existsSync(plist)) process.exit(0)

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'ignore' })
}

try {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    try {
      run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${NAME}`, plist])
    } catch {
      run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${NAME}`, plist])
    }
  }

  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'sillygit-')) + '/icon.iconset'
  fs.mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    run('sips', ['-z', `${size}`, `${size}`, iconPng, '--out', `${iconset}/icon_${size}x${size}.png`])
    const x2 = size * 2
    run('sips', ['-z', `${x2}`, `${x2}`, iconPng, '--out', `${iconset}/icon_${size}x${size}@2x.png`])
  }
  run('iconutil', ['-c', 'icns', iconset, '-o', icns])
  fs.rmSync(path.dirname(iconset), { recursive: true, force: true })

  run('codesign', ['--force', '--deep', '--sign', '-', appPath])
  // Make Finder/Dock pick up the new name and icon instead of a cached one.
  run('touch', [appPath])
} catch (err) {
  console.warn(`[brand-dev-electron] could not rename Electron.app: ${err.message}`)
}
