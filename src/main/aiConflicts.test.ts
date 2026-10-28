import { describe, expect, it, vi } from 'vitest'
import { parseConflictMarkers } from '../shared/conflicts'

vi.mock('./settings', () => ({ getApiKey: async () => null }))
const { buildConflictPrompt, parseConflictResponse } = await import('./ai')

const marked =
  'import a\n<<<<<<< main\nconst x = 1\n||||||| base\nconst x = 0\n=======\nconst x = 2\n>>>>>>> feature\nexport x\n<<<<<<< main\nkeep\n||||||| base\n=======\n>>>>>>> feature\n'
const segments = parseConflictMarkers(marked)

describe('AI conflict prompt', () => {
  it('numbers each conflict and shows all three versions with the branch names', () => {
    const prompt = buildConflictPrompt({ path: 'src/x.ts', currentLabel: 'main', incomingLabel: 'feature', segments })
    expect(prompt).toContain('<<<<<<< CONFLICT 0 — CURRENT (main)\nconst x = 1\n||||||| BASE (common ancestor)\nconst x = 0\n======= INCOMING (feature)\nconst x = 2\n>>>>>>> END CONFLICT 0')
    expect(prompt).toContain('CONFLICT 1')
    expect(prompt).toContain('2 conflicts')
  })

  it('cuts a long file down to the conflicts and the lines around them', () => {
    const long = Array.from({ length: 5000 }, (_, i) => `line ${i} with some padding text\n`).join('')
    const segs = parseConflictMarkers(long + '<<<<<<< a\nx\n||||||| b\n=======\ny\n>>>>>>> c\n' + long)
    const prompt = buildConflictPrompt({ path: 'big.txt', currentLabel: 'a', incomingLabel: 'c', segments: segs })
    expect(prompt.length).toBeLessThan(20000)
    expect(prompt).toContain('line 4999 with')
    expect(prompt).toContain('unchanged lines')
  })
})

describe('AI conflict response', () => {
  it('turns resolutions into lines, defaulting unknown confidence to low', () => {
    const res = parseConflictResponse(
      'Here: {"summary":"ok","resolutions":[{"conflict":1,"resolved":"","confidence":"high","explanation":"drop"},{"conflict":0,"resolved":"const x = 2\\nconst y = 1","confidence":"sure","explanation":"both"}]}',
      segments
    )
    expect(res).toEqual({
      hunkCount: 2,
      summary: 'ok',
      resolutions: [
        { hunkId: 0, lines: ['const x = 2\n', 'const y = 1\n'], confidence: 'low', explanation: 'both' },
        { hunkId: 1, lines: [], confidence: 'high', explanation: 'drop' }
      ]
    })
  })

  it('drops unknown hunks, repeats and answers that still have markers', () => {
    const res = parseConflictResponse(
      JSON.stringify({
        resolutions: [
          { conflict: 7, resolved: 'x' },
          { conflict: 0, resolved: '<<<<<<< oops\nx\n=======\ny\n>>>>>>> z' },
          { conflict: 1, resolved: 'a', confidence: 'medium' },
          { conflict: 1, resolved: 'b' }
        ]
      }),
      segments
    )
    expect(res.resolutions).toEqual([{ hunkId: 1, lines: ['a\n'], confidence: 'medium', explanation: '' }])
  })

  it('keeps the file’s CRLF line endings', () => {
    const crlf = parseConflictMarkers(marked.replace(/\n/g, '\r\n'))
    const res = parseConflictResponse('{"resolutions":[{"conflict":0,"resolved":"a\\nb\\n"}]}', crlf)
    expect(res.resolutions[0].lines).toEqual(['a\r\n', 'b\r\n'])
  })

  it('fails when nothing usable comes back', () => {
    expect(() => parseConflictResponse('no json here', segments)).toThrow('conflict resolutions')
    expect(() => parseConflictResponse('{"resolutions":[]}', segments)).toThrow('did not suggest')
  })
})
