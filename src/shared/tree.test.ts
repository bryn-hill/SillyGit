import { describe, expect, it } from 'vitest'
import { filterTree, parentFolders, parseLsTree, treeRows, type TreeEntry } from './tree'

const file = (path: string, size = 1): TreeEntry => ({ path, kind: 'file', size })

describe('parseLsTree', () => {
  it('reads files, links and submodules, keeping odd paths whole', () => {
    const out = [
      '100644 blob 1111111111111111111111111111111111111111      12\tsrc/a b.ts',
      '120000 blob 2222222222222222222222222222222222222222       5\tlink',
      '160000 commit 3333333333333333333333333333333333333333       -\tvendor/lib',
      '100755 blob 4444444444444444444444444444444444444444    1024\ttab\there.sh',
      ''
    ].join('\0')
    expect(parseLsTree(out)).toEqual([
      { path: 'src/a b.ts', kind: 'file', size: 12 },
      { path: 'link', kind: 'link', size: 5 },
      { path: 'vendor/lib', kind: 'submodule', size: null },
      { path: 'tab\there.sh', kind: 'file', size: 1024 }
    ])
  })
})

describe('treeRows', () => {
  const entries = [file('README.md'), file('src/b.ts'), file('src/lib/x.ts'), file('src/a.ts'), file('docs/index.html')]

  it('lists folders first, closed, with how many files each holds', () => {
    expect(treeRows(entries, new Set()).map((r) => [r.type, r.name, r.type === 'folder' ? r.files : null])).toEqual([
      ['folder', 'docs', 1],
      ['folder', 'src', 3],
      ['file', 'README.md', null]
    ])
  })

  it('shows what is inside open folders, indented', () => {
    const rows = treeRows(entries, new Set(['src', 'src/lib']))
    expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.name}`)).toEqual([
      'docs',
      'src',
      '  lib',
      '    x.ts',
      '  a.ts',
      '  b.ts',
      'README.md'
    ])
    expect(rows.find((r) => r.name === 'x.ts')?.path).toBe('src/lib/x.ts')
  })

  it('ignores an open folder inside a closed one', () => {
    expect(treeRows(entries, new Set(['src/lib'])).map((r) => r.name)).toEqual(['docs', 'src', 'README.md'])
  })

  it('sorts names the way people read them', () => {
    const rows = treeRows([file('f10.txt'), file('F2.txt'), file('f1.txt')], new Set())
    expect(rows.map((r) => r.name)).toEqual(['f1.txt', 'F2.txt', 'f10.txt'])
  })
})

describe('filterTree', () => {
  const entries = [file('src/main/git/tree.ts'), file('src/shared/tree.test.ts'), file('README.md')]

  it('keeps paths holding every word, ignoring case', () => {
    expect(filterTree(entries, 'TREE').map((e) => e.path)).toEqual(['src/main/git/tree.ts', 'src/shared/tree.test.ts'])
    expect(filterTree(entries, 'shared tree').map((e) => e.path)).toEqual(['src/shared/tree.test.ts'])
  })

  it('keeps everything for a blank query', () => {
    expect(filterTree(entries, '  ')).toBe(entries)
  })
})

describe('parentFolders', () => {
  it('lists the folders holding a path, outermost first', () => {
    expect(parentFolders('a/b/c.ts')).toEqual(['a', 'a/b'])
    expect(parentFolders('top.ts')).toEqual([])
  })
})
