import { app } from 'electron'
import path from 'path'

/**
 * Where the Agent SDK's native `claude` binary lives in an installed build.
 * The SDK finds it with require.resolve, which points inside app.asar, and a
 * binary can't be spawned from there. electron-builder unpacks the package
 * (asarUnpack in electron-builder.yml), so point at the unpacked copy.
 * Undefined in dev runs, where the SDK's own lookup works.
 */
export function claudeExecutable(
  // app is undefined when unit tests load this outside Electron.
  packaged = app?.isPackaged ?? false,
  resourcesPath = process.resourcesPath,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | undefined {
  if (!packaged) return undefined
  const binary = platform === 'win32' ? 'claude.exe' : 'claude'
  return path.join(
    resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@anthropic-ai',
    `claude-agent-sdk-${platform}-${arch}`,
    binary
  )
}
