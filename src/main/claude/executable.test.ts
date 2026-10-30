import { describe, expect, it } from 'vitest'
import path from 'path'
import { claudeExecutable } from './executable'

describe('claudeExecutable', () => {
  it('leaves dev runs to the SDK', () => {
    expect(claudeExecutable(false, '/res', 'darwin', 'arm64')).toBeUndefined()
  })

  it('points packaged macOS builds at the unpacked binary', () => {
    expect(claudeExecutable(true, '/App/Contents/Resources', 'darwin', 'arm64')).toBe(
      path.join(
        '/App/Contents/Resources',
        'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'
      )
    )
  })

  it('uses claude.exe on Windows', () => {
    expect(claudeExecutable(true, 'C:/SillyGit/resources', 'win32', 'x64')).toBe(
      path.join(
        'C:/SillyGit/resources',
        'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'
      )
    )
  })
})
