import { describe, expect, it } from 'vitest'
import { buildRunScript, installCommandFor, lockfileFor, shellQuote, splitLeadingCd, suggestRunCommand } from './run'

describe('installCommandFor', () => {
  it('picks the package manager from the lockfile', () => {
    expect(installCommandFor(['package.json', 'package-lock.json'])).toBe('npm ci')
    expect(installCommandFor(['package.json', 'pnpm-lock.yaml'])).toBe('pnpm install --frozen-lockfile')
    expect(installCommandFor(['yarn.lock'])).toBe('yarn install --frozen-lockfile')
    expect(installCommandFor(['bun.lock'])).toBe('bun install --frozen-lockfile')
    expect(lockfileFor(['src', 'yarn.lock'])).toBe('yarn.lock')
  })

  it('has nothing to install without a lockfile', () => {
    expect(installCommandFor(['package.json', 'README.md'])).toBeNull()
    expect(lockfileFor(['Cargo.toml'])).toBeNull()
  })
})

describe('suggestRunCommand', () => {
  const pkg = (scripts: Record<string, string>): string => JSON.stringify({ scripts })

  it('prefers dev, then start', () => {
    expect(suggestRunCommand(pkg({ start: 'node .', dev: 'vite' }), ['package-lock.json'])).toBe('npm run dev')
    expect(suggestRunCommand(pkg({ start: 'node .' }), [])).toBe('npm run start')
  })

  it('uses the package manager the repo uses', () => {
    expect(suggestRunCommand(pkg({ dev: 'vite' }), ['pnpm-lock.yaml'])).toBe('pnpm dev')
    expect(suggestRunCommand(pkg({ dev: 'vite' }), ['yarn.lock'])).toBe('yarn dev')
  })

  it('suggests nothing when there is no script to run', () => {
    expect(suggestRunCommand(null, [])).toBe('')
    expect(suggestRunCommand('not json', [])).toBe('')
    expect(suggestRunCommand(pkg({ test: 'vitest' }), [])).toBe('')
  })
})

describe('buildRunScript', () => {
  it('is just the command when nothing needs installing', () => {
    expect(buildRunScript('npm run dev', null, 'darwin')).toBe('npm run dev')
  })

  it('installs first and records the lockfile once the install succeeds', () => {
    const install = { command: 'npm ci', marker: "/tmp/it's here/marker", hash: 'abc' }
    expect(buildRunScript('npm run dev', install, 'darwin')).toBe(
      `npm ci && printf %s 'abc' > '/tmp/it'\\''s here/marker' && npm run dev`
    )
    expect(buildRunScript('npm run dev', install, 'win32')).toBe('npm ci && npm run dev')
  })

  it('quotes for a POSIX shell', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`)
  })
})

describe('splitLeadingCd', () => {
  it('splits off a leading cd into a folder', () => {
    expect(splitLeadingCd('cd web && npm run dev')).toEqual({ dir: 'web', dirToken: 'web', rest: 'npm run dev' })
    expect(splitLeadingCd(`cd 'my app' && npm start`)).toEqual({ dir: 'my app', dirToken: `'my app'`, rest: 'npm start' })
    expect(splitLeadingCd('cd "a b"&&make')).toEqual({ dir: 'a b', dirToken: '"a b"', rest: 'make' })
  })

  it('leaves other commands alone', () => {
    expect(splitLeadingCd('npm run dev').dir).toBeNull()
    expect(splitLeadingCd('cd web; npm run dev').dir).toBeNull()
  })
})
