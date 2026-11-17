import { describe, expect, it } from 'vitest'
import { mergeUpdateInfo } from './merge-mac-update-info.mjs'

const file = (url) => ({ url, sha512: `sha-${url}`, size: 1 })
const arm = {
  version: '0.3.0',
  files: [file('SillyGit-0.3.0-mac-arm64.zip'), file('SillyGit-0.3.0-mac-arm64.dmg')],
  path: 'SillyGit-0.3.0-mac-arm64.zip',
  sha512: 'sha-SillyGit-0.3.0-mac-arm64.zip',
  releaseDate: '2026-11-17T10:00:00.000Z'
}
const intel = {
  version: '0.3.0',
  files: [file('SillyGit-0.3.0-mac-x64.zip'), file('SillyGit-0.3.0-mac-x64.dmg')],
  path: 'SillyGit-0.3.0-mac-x64.zip',
  sha512: 'sha-SillyGit-0.3.0-mac-x64.zip',
  releaseDate: '2026-11-17T10:05:00.000Z'
}

describe('mergeUpdateInfo', () => {
  it('lists both architectures and points the legacy path at the Intel zip', () => {
    const merged = mergeUpdateInfo([arm, intel])
    expect(merged.files.map((f) => f.url)).toEqual([
      'SillyGit-0.3.0-mac-arm64.zip',
      'SillyGit-0.3.0-mac-arm64.dmg',
      'SillyGit-0.3.0-mac-x64.zip',
      'SillyGit-0.3.0-mac-x64.dmg'
    ])
    expect(merged.path).toBe('SillyGit-0.3.0-mac-x64.zip')
    expect(merged.sha512).toBe('sha-SillyGit-0.3.0-mac-x64.zip')
    expect(merged.releaseDate).toBe('2026-11-17T10:05:00.000Z')
  })

  it('drops files listed twice', () => {
    expect(mergeUpdateInfo([arm, arm]).files).toHaveLength(2)
  })

  it('refuses files for different versions', () => {
    expect(() => mergeUpdateInfo([arm, { ...intel, version: '0.2.9' }])).toThrow(/different versions/)
  })
})
