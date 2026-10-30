import { describe, expect, it } from 'vitest'
import { formatBytes, imageMime, imageSources } from './imageDiff'

describe('imageMime', () => {
  it('knows images by extension, in any case', () => {
    expect(imageMime('a/logo.PNG')).toBe('image/png')
    expect(imageMime('icon.svg')).toBe('image/svg+xml')
    expect(imageMime('notes.txt')).toBeNull()
    expect(imageMime('png')).toBeNull()
  })
})

describe('imageSources', () => {
  it('follows a rename back to the old path for a commit', () => {
    expect(imageSources({ hash: 'abc', staged: false, untracked: false, path: 'new.png', oldPath: 'old.png' })).toEqual({
      before: { kind: 'object', spec: 'abc^:old.png' },
      after: { kind: 'object', spec: 'abc:new.png' }
    })
  })
})

describe('formatBytes', () => {
  it('picks a unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
