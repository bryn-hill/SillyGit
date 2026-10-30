import { describe, expect, it } from 'vitest'
import { changedWordsForHunk, diffWords, splitByRanges, tokenize, type WordDiffLine } from './wordDiff'

const changedText = (text: string, ranges: [number, number][]): string[] => ranges.map(([s, e]) => text.slice(s, e))

describe('tokenize', () => {
  it('splits words, whitespace and punctuation', () => {
    expect(tokenize('const x = foo(1, 2);')).toEqual(['const', ' ', 'x', ' ', '=', ' ', 'foo', '(', '1', ',', ' ', '2', ')', ';'])
  })

  it('keeps accented words whole', () => {
    expect(tokenize('café olé')).toEqual(['café', ' ', 'olé'])
  })

  it('returns nothing for an empty line', () => {
    expect(tokenize('')).toEqual([])
  })
})

describe('diffWords', () => {
  it('marks only the changed word on each side', () => {
    const oldText = 'const total = price * quantity'
    const newText = 'const total = cost * quantity'
    const words = diffWords(oldText, newText)!
    expect(changedText(oldText, words.old)).toEqual(['price'])
    expect(changedText(newText, words.new)).toEqual(['cost'])
  })

  it('marks an inserted argument and leaves the removed side empty', () => {
    const oldText = 'call(a, b)'
    const newText = 'call(a, b, c)'
    const words = diffWords(oldText, newText)!
    expect(words.old).toEqual([])
    expect(changedText(newText, words.new)).toEqual([', c'])
  })

  it('joins neighbouring changes separated only by whitespace', () => {
    const oldText = 'let a = one two three end'
    const newText = 'let a = uno dos tres end'
    const words = diffWords(oldText, newText)!
    expect(changedText(oldText, words.old)).toEqual(['one two three'])
    expect(changedText(newText, words.new)).toEqual(['uno dos tres'])
  })

  it('keeps changes apart when unchanged words sit between them', () => {
    const oldText = 'a(x) + b(y)'
    const newText = 'a(z) + b(w)'
    const words = diffWords(oldText, newText)!
    expect(changedText(oldText, words.old)).toEqual(['x', 'y'])
    expect(changedText(newText, words.new)).toEqual(['z', 'w'])
  })

  it('marks a whitespace-only change', () => {
    const words = diffWords('a  b', 'a b')!
    expect(words.old).toEqual([[1, 3]])
    expect(words.new).toEqual([[1, 2]])
  })

  it('gives up on lines that were rewritten', () => {
    expect(diffWords('import React from "react"', 'export default function App() {')).toBeNull()
  })

  it('gives up on very long lines', () => {
    expect(diffWords('x'.repeat(2000), 'y'.repeat(2000))).toBeNull()
  })

  it('handles identical and empty lines', () => {
    expect(diffWords('same', 'same')).toEqual({ old: [], new: [] })
    expect(diffWords('', '')).toEqual({ old: [], new: [] })
  })
})

describe('changedWordsForHunk', () => {
  const line = (type: WordDiffLine['type'], text: string): WordDiffLine => ({ type, text })

  it('pairs a removed run with the added run that follows it, in order', () => {
    const lines = [
      line('context', 'function f() {'),
      line('remove', '  return a + 1'),
      line('remove', '  // old note'),
      line('add', '  return a + 2'),
      line('add', '  // new note'),
      line('context', '}')
    ]
    const result = changedWordsForHunk(lines)
    expect(result[0]).toBeNull()
    expect(changedText(lines[1].text, result[1]!)).toEqual(['1'])
    expect(changedText(lines[3].text, result[3]!)).toEqual(['2'])
    expect(changedText(lines[2].text, result[2]!)).toEqual(['old'])
    expect(changedText(lines[4].text, result[4]!)).toEqual(['new'])
    expect(result[5]).toBeNull()
  })

  it('leaves unpaired lines whole', () => {
    const lines = [line('remove', 'value = 1'), line('add', 'value = 2'), line('add', 'extra = 3')]
    const result = changedWordsForHunk(lines)
    expect(result[0]).not.toBeNull()
    expect(result[1]).not.toBeNull()
    expect(result[2]).toBeNull()
  })

  it('does not pair across context lines or pair adds with a later remove', () => {
    const lines = [line('add', 'value = 2'), line('remove', 'value = 1'), line('context', 'x'), line('add', 'value = 3')]
    expect(changedWordsForHunk(lines)).toEqual([null, null, null, null])
  })
})

describe('splitByRanges', () => {
  it('splits text into changed and unchanged pieces', () => {
    expect(splitByRanges('abcdef', [[1, 3], [4, 5]])).toEqual([
      { text: 'a', changed: false },
      { text: 'bc', changed: true },
      { text: 'd', changed: false },
      { text: 'e', changed: true },
      { text: 'f', changed: false }
    ])
  })

  it('clamps ranges past the end of the text', () => {
    expect(splitByRanges('ab', [[1, 9]])).toEqual([
      { text: 'a', changed: false },
      { text: 'b', changed: true }
    ])
  })

  it('returns the whole text when there are no ranges', () => {
    expect(splitByRanges('', [])).toEqual([{ text: '', changed: false }])
  })
})

describe('diffWords edges', () => {
  it('does not mark the spaces around a changed phrase', () => {
    const oldText = 'return price * rate'
    const newText = 'return (cost - discount) * rate'
    const words = diffWords(oldText, newText)!
    expect(changedText(oldText, words.old)).toEqual(['price'])
    expect(changedText(newText, words.new)).toEqual(['(cost - discount)'])
  })
})
