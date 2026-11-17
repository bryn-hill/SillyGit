// Updating an installed SillyGit (one downloaded from GitHub Releases, not a
// source checkout; see selfUpdate.ts for those). Where the platform allows,
// electron-updater downloads the next release and swaps it in on restart.
// Elsewhere SillyGit can only say there's a new version and link to it.

export const RELEASES_REPO = 'bryn-hill/SillyGit'
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`

/** The release page for a version, e.g. 0.3.0. */
export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`
}

/**
 * Where an update stands:
 * - idle: no update known (up to date, or not checked yet)
 * - checking: asking GitHub for the latest release
 * - available: a newer release exists and hasn't been downloaded
 * - downloading: fetching it (percent says how far)
 * - ready: downloaded; restarting installs it
 */
export type AppUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready'

export interface AppUpdateStatus {
  /** False for source checkouts, dev runs and e2e tests, which never check releases. */
  supported: boolean
  /**
   * Why this install can't update in place, so the dialog links to the
   * download instead (a Windows zip, Linux); null when it can.
   */
  manualReason: string | null
  currentVersion: string
  /** The newest release's version when it's newer than this one. */
  latestVersion: string | null
  phase: AppUpdatePhase
  /** How much of the download is done, 0 to 100, while downloading. */
  percent: number | null
  /** When GitHub was last asked, ms since the epoch. */
  checkedAt: number | null
  /** Why the last check or download failed. */
  error: string | null
}

export const NO_APP_UPDATE: AppUpdateStatus = {
  supported: false,
  manualReason: null,
  currentVersion: '',
  latestVersion: null,
  phase: 'idle',
  percent: null,
  checkedAt: null,
  error: null
}

/** Whether a newer release is waiting, to download, install or fetch by hand. */
export function hasAppUpdate(status: AppUpdateStatus): boolean {
  return status.supported && status.latestVersion !== null && status.phase !== 'checking'
}

function parseVersion(version: string): { core: number[]; pre: string | null } {
  const [main, ...pre] = version.trim().replace(/^v/, '').split('-')
  const core = main.split('.').map((n) => Number.parseInt(n, 10) || 0)
  while (core.length < 3) core.push(0)
  return { core, pre: pre.length ? pre.join('-') : null }
}

/** Compares two semver versions (a leading v is fine): negative when a is older, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (va.core[i] !== vb.core[i]) return va.core[i] - vb.core[i]
  }
  // A prerelease (1.0.0-beta) comes before its release (1.0.0).
  if (va.pre === vb.pre) return 0
  if (va.pre === null) return 1
  if (vb.pre === null) return -1
  return va.pre < vb.pre ? -1 : 1
}

export interface InstallFacts {
  platform: NodeJS.Platform
  /** Whether the NSIS uninstaller sits next to SillyGit.exe, i.e. it came from the installer, not the zip. */
  hasWindowsUninstaller: boolean
  /** process.env.APPIMAGE: set when running from an AppImage. */
  appImage: string | undefined
}

/** Why this install has to be updated by hand, or null when electron-updater can replace it. */
export function manualUpdateReason(facts: InstallFacts): string | null {
  switch (facts.platform) {
    case 'darwin':
      return null
    case 'win32':
      return facts.hasWindowsUninstaller
        ? null
        : "This copy of SillyGit was unzipped rather than installed, so it can't replace itself. Download the new version, or use the installer (.exe) to get automatic updates."
    case 'linux':
      return facts.appImage ? null : "This build of SillyGit can't replace itself. Download or build the new version."
    default:
      return "SillyGit can't update itself on this system. Download the new version."
  }
}

/** The Update button's tooltip for an installed build. */
export function appUpdateTitle(status: AppUpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking for a new version of SillyGit…'
    case 'downloading':
      return `Downloading SillyGit ${status.latestVersion}${status.percent !== null ? ` (${Math.round(status.percent)}%)` : ''}…`
    case 'ready':
      return `SillyGit ${status.latestVersion} is ready. Restart to finish updating.`
    default:
      return status.latestVersion
        ? `Update SillyGit: version ${status.latestVersion} is out`
        : `SillyGit ${status.currentVersion} is up to date. Click to check again.`
  }
}
