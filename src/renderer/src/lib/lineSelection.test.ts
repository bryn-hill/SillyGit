import { describe, expect, it } from 'vitest'
import type { RenderedDiffLine } from './diffRender'
import { selectDiffLine } from './lineSelection'

const line = (type: RenderedDiffLine['type']): RenderedDiffLine => ({ type, text: '', oldLine: null, newLine: null })
// context, remove, remove, context, add, add
const hunk = [line('context'), line('remove'), line('remove'), line('context'), line('add'), line('add')]

describe('selectDiffLine', () => {
  it('toggles a line on and off', () => {
    const one = selectDiffLine(null, 'h', hunk, 1, false)
    expect(one).toEqual({ hunkId: 'h', lines: [1], anchor: 1 })
    expect(selectDiffLine(one, 'h', hunk, 1, false)).toBeNull()
  })

  it('shift-click picks the changed lines between the anchor and the click', () => {
    const one = selectDiffLine(null, 'h', hunk, 1, false)
    expect(selectDiffLine(one, 'h', hunk, 5, true)?.lines).toEqual([1, 2, 4, 5])
  })

  it('starts over when another hunk is clicked', () => {
    const one = selectDiffLine(null, 'h', hunk, 1, false)
    expect(selectDiffLine(one, 'g', hunk, 4, true)).toEqual({ hunkId: 'g', lines: [4], anchor: 4 })
  })
})
