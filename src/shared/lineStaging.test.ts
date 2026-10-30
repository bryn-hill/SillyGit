import { describe, expect, it } from 'vitest'
import { buildPartialPatch } from './lineStaging'

const DIFF = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,4 @@ section
 one
-two
+TWO
+extra
 three
`

describe('buildPartialPatch', () => {
  it('keeps the whole hunk when nothing is picked', () => {
    expect(buildPartialPatch(DIFF, 'f0h0', null, false)).toContain('@@ -1,3 +1,4 @@ section\n one\n-two\n+TWO\n+extra\n three\n')
  })

  it('turns an unpicked removal into context and drops an unpicked addition going forwards', () => {
    const patch = buildPartialPatch(DIFF, 'f0h0', new Set([3]), false)
    expect(patch).toContain('@@ -1,3 +1,4 @@ section\n one\n two\n+extra\n three\n')
  })

  it('does the opposite for a reverse patch', () => {
    const patch = buildPartialPatch(DIFF, 'f0h0', new Set([1]), true)
    expect(patch).toContain('@@ -1,5 +1,4 @@ section\n one\n-two\n TWO\n extra\n three\n')
  })

  it('returns null when no changed line is picked', () => {
    expect(buildPartialPatch(DIFF, 'f0h0', new Set([0]), false)).toBeNull()
    expect(buildPartialPatch(DIFF, 'f9h0', null, false)).toBeNull()
  })
})
