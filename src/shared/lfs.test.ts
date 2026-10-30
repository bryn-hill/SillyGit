import { describe, expect, it } from 'vitest'
import {
  isLfsPointerDiff,
  lfsPathsFromCheckAttr,
  lfsPatternsFromAttributes,
  lfsTrackOptions,
  parseLfsPointer,
  parseLfsVersion
} from './lfs'

const OID = 'a'.repeat(64)
const pointer = (size = 12345, oid = OID): string =>
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`

describe('parseLfsPointer', () => {
  it('reads the object id and size of a pointer file', () => {
    expect(parseLfsPointer(pointer())).toEqual({ oid: OID, size: 12345 })
  })

  it('is null for anything else', () => {
    expect(parseLfsPointer('hello')).toBeNull()
    expect(parseLfsPointer('version https://git-lfs.github.com/spec/v1\nsize 3\n')).toBeNull()
    expect(parseLfsPointer(pointer() + 'x'.repeat(2000))).toBeNull()
  })
})

describe('isLfsPointerDiff', () => {
  it('spots a diff between two pointers', () => {
    const diff = [
      'diff --git a/big.bin b/big.bin',
      '@@ -1,3 +1,3 @@',
      ' version https://git-lfs.github.com/spec/v1',
      `-oid sha256:${OID}`,
      `+oid sha256:${'b'.repeat(64)}`,
      '-size 10',
      '+size 12'
    ].join('\n')
    expect(isLfsPointerDiff(diff)).toBe(true)
  })

  it('spots a newly added pointer', () => {
    const lines = pointer().trimEnd().split('\n').map((l) => `+${l}`)
    expect(isLfsPointerDiff(['--- /dev/null', '+++ b/a.bin', '@@ -0,0 +1,3 @@', ...lines].join('\n'))).toBe(true)
  })

  it('leaves ordinary diffs alone, even ones that mention the spec', () => {
    expect(isLfsPointerDiff('@@ -1 +1 @@\n-a\n+b')).toBe(false)
    expect(isLfsPointerDiff('@@ -1 +1 @@\n+see version https://git-lfs.github.com/spec/v1')).toBe(false)
  })
})

describe('lfsPathsFromCheckAttr', () => {
  it('picks the paths whose filter is lfs', () => {
    const out = ['a.psd', 'filter', 'lfs', 'b.txt', 'filter', 'unspecified', 'dir/c d.bin', 'filter', 'lfs', ''].join('\0')
    expect([...lfsPathsFromCheckAttr(out)]).toEqual(['a.psd', 'dir/c d.bin'])
  })

  it('is empty for no output', () => {
    expect(lfsPathsFromCheckAttr('').size).toBe(0)
  })
})

describe('lfsPatternsFromAttributes', () => {
  const text = [
    '# assets',
    '*.psd filter=lfs diff=lfs merge=lfs -text',
    '*.txt text eol=lf',
    '',
    'models/** filter=lfs diff=lfs merge=lfs -text',
    '/root.bin filter=lfs'
  ].join('\n')

  it('lists the patterns with filter=lfs', () => {
    expect(lfsPatternsFromAttributes(text)).toEqual(['*.psd', 'models/**', '/root.bin'])
  })

  it('puts a nested file’s directory in front', () => {
    expect(lfsPatternsFromAttributes(text, 'game')).toEqual(['game/*.psd', 'game/models/**', 'game/root.bin'])
  })
})

describe('parseLfsVersion', () => {
  it('reads the version', () => {
    expect(parseLfsVersion('git-lfs/3.4.1 (GitHub; linux amd64; go 1.22.2)\n')).toBe('3.4.1')
    expect(parseLfsVersion('nope')).toBeNull()
  })
})

describe('lfsTrackOptions', () => {
  it('offers the extension and the file', () => {
    expect(lfsTrackOptions('art/hero.psd')).toEqual([
      { pattern: '*.psd', label: 'All *.psd files' },
      { pattern: 'art/hero.psd', label: 'Only this file' }
    ])
  })

  it('offers only the file when it has no extension', () => {
    expect(lfsTrackOptions('bin/tool').map((o) => o.pattern)).toEqual(['bin/tool'])
    expect(lfsTrackOptions('.env').map((o) => o.pattern)).toEqual(['.env'])
  })
})
