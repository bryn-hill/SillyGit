import { describe, expect, it } from 'vitest'
import { filterPathspecs, folderOf, foldersOf, graphFilterLabel, parseSearch } from './historySearch'

describe('parseSearch', () => {
  it('uses the dropdown mode without a prefix', () => {
    expect(parseSearch('  login  ', 'message')).toEqual({ mode: 'message', term: 'login' })
    expect(parseSearch('login', 'all')).toEqual({ mode: 'all', term: 'login' })
  })

  it('lets a typed prefix pick the mode', () => {
    expect(parseSearch('author: Ada', 'all')).toEqual({ mode: 'author', term: 'Ada' })
    expect(parseSearch('Author:ada', 'all')).toEqual({ mode: 'author', term: 'ada' })
    expect(parseSearch('msg:fix bug', 'all')).toEqual({ mode: 'message', term: 'fix bug' })
    expect(parseSearch('path:src/main', 'author')).toEqual({ mode: 'path', term: 'src/main' })
    expect(parseSearch('file:README', 'all')).toEqual({ mode: 'path', term: 'README' })
    expect(parseSearch('-SuseState', 'all')).toEqual({ mode: 'change', term: 'useState' })
    expect(parseSearch('change: TODO', 'all')).toEqual({ mode: 'change', term: 'TODO' })
    expect(parseSearch('-Gfoo.*bar', 'all')).toEqual({ mode: 'regex', term: 'foo.*bar' })
    expect(parseSearch('regex:^import', 'all')).toEqual({ mode: 'regex', term: '^import' })
  })

  it('keeps git’s -S and -G case-sensitive', () => {
    expect(parseSearch('-sfoo', 'all')).toEqual({ mode: 'all', term: '-sfoo' })
  })

  it('has an empty term for a bare prefix', () => {
    expect(parseSearch('author:', 'all')).toEqual({ mode: 'author', term: '' })
  })
})

describe('folders', () => {
  it('finds the folder a file is in', () => {
    expect(folderOf('src/main/git.ts')).toBe('src/main')
    expect(folderOf('src/main/')).toBe('src')
    expect(folderOf('README.md')).toBeNull()
  })

  it('lists every folder of a set of files once, sorted', () => {
    expect(foldersOf(['src/main/a.ts', 'src/main/b.ts', 'src/renderer/c.tsx', 'docs/x.md', 'top.txt'])).toEqual([
      'docs',
      'src',
      'src/main',
      'src/renderer'
    ])
  })
})

describe('filterPathspecs', () => {
  it('matches an exact file or folder literally', () => {
    expect(filterPathspecs({ path: 'src/[id]/page.tsx' })).toEqual([':(literal)src/[id]/page.tsx'])
    expect(filterPathspecs({ path: './src/main/' })).toEqual([':(literal)src/main'])
  })

  it('matches any path containing the text, escaping glob characters', () => {
    expect(filterPathspecs({ path: 'main', contains: true })).toEqual([
      ':(icase,glob)**/*main*',
      ':(icase,glob)**/*main*/**'
    ])
    expect(filterPathspecs({ path: 'a*b', contains: true })[0]).toBe(':(icase,glob)**/*a\\*b*')
  })
})

describe('graphFilterLabel', () => {
  it('names what the graph is narrowed to', () => {
    expect(graphFilterLabel({ path: 'src/main' })).toBe('History of src/main')
    expect(graphFilterLabel({ path: 'main', contains: true })).toBe('Paths containing “main”')
  })
})
