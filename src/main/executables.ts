import { constants, promises as fsp } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join } from 'path'

// Apps started from the Dock or Finder on macOS get a bare PATH, without
// Homebrew's or the user's own bin folders where tools like `code` and
// `claude` live.
export function searchPath(pathEnv: string | undefined = process.env.PATH, home: string = homedir()): string[] {
  const extra =
    process.platform === 'win32'
      ? []
      : [
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          join(home, 'bin'),
          join(home, '.local', 'bin'),
          join(home, '.claude', 'local')
        ]
  return [...new Set([...(pathEnv ?? '').split(delimiter), ...extra].filter(Boolean))]
}

export async function isExecutable(path: string): Promise<boolean> {
  return fsp
    .access(path, constants.X_OK)
    .then(() => true)
    .catch(() => false)
}

/** The full path of `program`, looked up on PATH (plus the usual extra folders) and then in `fallbacks`. */
export async function findExecutable(program: string, fallbacks: string[] = []): Promise<string | null> {
  if (isAbsolute(program)) return (await isExecutable(program)) ? program : null
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of searchPath()) {
    for (const ext of exts) {
      const candidate = join(dir, program + ext)
      if (await isExecutable(candidate)) return candidate
    }
  }
  for (const f of fallbacks) if (await isExecutable(f)) return f
  return null
}
