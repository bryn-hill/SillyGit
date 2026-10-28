/**
 * How Run treats a selected commit: run it in isolation (a separate checkout,
 * leaving the working tree alone), or check it out in the repo and run it there.
 */
export type RunMode = 'isolated' | 'checkout'

/** What the main process hands the renderer to start a Run in the terminal. */
export interface RunPlan {
  /** Where the command runs: the repo itself, or the separate checkout of a commit. */
  cwd: string
  /** The full shell line, including any dependency install for a fresh checkout. */
  script: string
  /** The command the user configured, for the terminal tab's title. */
  command: string
  /** The commit being run, or null when running the working tree. */
  commit: string | null
}

/**
 * How to install a JavaScript project's dependencies from its lockfile, picked
 * by which lockfile is present. Null when the project has no lockfile we know.
 */
export function installCommandFor(files: string[]): string | null {
  const has = (name: string): boolean => files.includes(name)
  if (has('pnpm-lock.yaml')) return 'pnpm install --frozen-lockfile'
  if (has('yarn.lock')) return 'yarn install --frozen-lockfile'
  if (has('bun.lockb') || has('bun.lock')) return 'bun install --frozen-lockfile'
  if (has('package-lock.json') || has('npm-shrinkwrap.json')) return 'npm ci'
  return null
}

/** The lockfile `installCommandFor` chose its command from. */
export function lockfileFor(files: string[]): string | null {
  for (const name of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json', 'npm-shrinkwrap.json']) {
    if (files.includes(name)) return name
  }
  return null
}

/** A sensible default run command from package.json's scripts, e.g. "npm run dev". */
export function suggestRunCommand(packageJson: string | null, files: string[]): string {
  if (!packageJson) return ''
  let scripts: Record<string, unknown> = {}
  try {
    scripts = (JSON.parse(packageJson) as { scripts?: Record<string, unknown> }).scripts ?? {}
  } catch {
    return ''
  }
  const runner = files.includes('pnpm-lock.yaml')
    ? 'pnpm'
    : files.includes('yarn.lock')
      ? 'yarn'
      : files.includes('bun.lockb') || files.includes('bun.lock')
        ? 'bun run'
        : 'npm run'
  for (const name of ['dev', 'start', 'serve']) {
    if (typeof scripts[name] === 'string') return `${runner} ${name}`
  }
  return ''
}

/** Quotes `value` for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The shell line for a Run. A commit's checkout installs dependencies first
 * when they're missing or were installed from a different lockfile; the
 * lockfile's hash is recorded only once the install succeeds.
 */
export function buildRunScript(
  command: string,
  install: { command: string; marker: string; hash: string } | null,
  platform: string
): string {
  if (!install) return command
  if (platform === 'win32') return `${install.command} && ${command}`
  return `${install.command} && printf %s ${shellQuote(install.hash)} > ${shellQuote(install.marker)} && ${command}`
}
