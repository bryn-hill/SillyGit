import { describe, expect, it } from 'vitest'
import { highlightLine, languageForPath } from './highlight'

describe('languageForPath', () => {
  it('maps extensions to Prism languages, ignoring case', () => {
    expect(languageForPath('src/App.tsx')).toBe('tsx')
    expect(languageForPath('index.TS')).toBe('typescript')
    expect(languageForPath('scripts/run.mjs')).toBe('javascript')
    expect(languageForPath('.github/workflows/ci.yml')).toBe('yaml')
    expect(languageForPath('page.htm')).toBe('markup')
    expect(languageForPath('README.md')).toBe('markdown')
  })

  it('is null for unknown or missing extensions', () => {
    expect(languageForPath('Makefile')).toBeNull()
    expect(languageForPath('main.rs')).toBeNull()
    expect(languageForPath('')).toBeNull()
  })
})

describe('highlightLine', () => {
  it('wraps tokens in Prism spans', () => {
    const html = highlightLine('const x = 1', 'typescript')
    expect(html).toContain('<span class="token keyword">const</span>')
    expect(html).toContain('<span class="token number">1</span>')
  })

  it('escapes HTML when there is no language', () => {
    expect(highlightLine('<b>a & b</b>', null)).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;')
  })

  it('escapes HTML for a language Prism has not loaded', () => {
    expect(highlightLine('a < b', 'cobol')).toBe('a &lt; b')
  })

  it('never lets code through as markup', () => {
    expect(highlightLine('"<img src=x onerror=alert(1)>"', 'javascript')).not.toContain('<img')
  })
})

describe('highlightLine with changed words', () => {
  it('marks changed ranges in plain escaped text, counting entities as one character', () => {
    expect(highlightLine('a < b', null, [[2, 3]])).toBe('a <mark class="diff-word">&lt;</mark> b')
  })

  it('closes and reopens the mark around syntax tokens instead of nesting across them', () => {
    const html = highlightLine('const x = 1', 'typescript', [[5, 11]])
    expect(html).toContain('<span class="token keyword">const</span><mark class="diff-word"> x </mark>')
    expect(html).toContain('<span class="token number"><mark class="diff-word">1</mark></span>')
    expect(html.replace(/<[^>]+>/g, '')).toBe('const x = 1')
  })

  it('leaves the line untouched with no ranges', () => {
    expect(highlightLine('a', null, [])).toBe('a')
    expect(highlightLine('a', null, null)).toBe('a')
  })
})
