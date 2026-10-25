import { describe, expect, it } from 'vitest'
import { allUnitIds, buildPatchForUnits, parseCommitDiff, validateGroupCoverage } from './diffSplit'

const TWO_FILE_DIFF = `diff --git a/foo.ts b/foo.ts
index 111..222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 line1
+added1
 line2
 line3
@@ -10,2 +11,3 @@
 line10
+added2
 line11
diff --git a/bar.ts b/bar.ts
index 333..444 100644
--- a/bar.ts
+++ b/bar.ts
@@ -1,2 +1,2 @@
-old
+new
`

describe('parseCommitDiff', () => {
  it('splits multiple files and multiple hunks into separately addressable units', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(units.map((u) => u.id)).toEqual(['f0h0', 'f0h1', 'f1h0'])
    expect(units[0].file).toBe('foo.ts')
    expect(units[1].file).toBe('foo.ts')
    expect(units[2].file).toBe('bar.ts')
    expect(units[0].hunkHeader).toBe('@@ -1,3 +1,4 @@')
    expect(units[0].body).toContain('+added1')
  })

  it('treats a binary/whole-file change with no hunks as a single unit', () => {
    const diff = `diff --git a/image.png b/image.png
index abc..def 100644
Binary files a/image.png and b/image.png differ
`
    const { units } = parseCommitDiff(diff)

    expect(units).toEqual([{ id: 'f0', file: 'image.png', hunkHeader: null, body: '' }])
  })

  it('resolves the display path for a pure rename with no diffable content', () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`
    const { units } = parseCommitDiff(diff)

    expect(units[0].file).toBe('new.txt')
    expect(units[0].hunkHeader).toBeNull()
  })

  it('falls back to the old path when the new side is /dev/null (deleted file)', () => {
    const diff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index 111..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line1
-line2
`
    const { units } = parseCommitDiff(diff)

    expect(units[0].file).toBe('old.ts')
  })
})

describe('buildPatchForUnits', () => {
  it('rebuilds a patch containing only the included units, preserving file header and hunk order', () => {
    const { fileBlocks } = parseCommitDiff(TWO_FILE_DIFF)

    const patch = buildPatchForUnits(fileBlocks, new Set(['f0h1']))

    expect(patch).toContain('diff --git a/foo.ts b/foo.ts')
    expect(patch).toContain('@@ -10,2 +11,3 @@')
    expect(patch).not.toContain('@@ -1,3 +1,4 @@')
    expect(patch).not.toContain('bar.ts')
  })

  it('omits a file entirely when none of its units are included', () => {
    const { fileBlocks } = parseCommitDiff(TWO_FILE_DIFF)

    const patch = buildPatchForUnits(fileBlocks, new Set(['f1h0']))

    expect(patch).not.toContain('foo.ts')
    expect(patch).toContain('bar.ts')
  })

  it('keeps hunks in their original order regardless of the order ids are passed in', () => {
    const { fileBlocks } = parseCommitDiff(TWO_FILE_DIFF)

    const patch = buildPatchForUnits(fileBlocks, new Set(['f0h1', 'f0h0']))

    expect(patch.indexOf('@@ -1,3 +1,4 @@')).toBeLessThan(patch.indexOf('@@ -10,2 +11,3 @@'))
  })

  it('includes a whole-file unit (no hunks) only when its id is selected', () => {
    const diff = `diff --git a/image.png b/image.png
index abc..def 100644
Binary files a/image.png and b/image.png differ
`
    const { fileBlocks } = parseCommitDiff(diff)

    expect(buildPatchForUnits(fileBlocks, new Set(['f0']))).toContain('image.png')
    expect(buildPatchForUnits(fileBlocks, new Set())).toBe('\n')
  })
})

describe('allUnitIds', () => {
  it('collects every unit id into a set', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(allUnitIds(units)).toEqual(new Set(['f0h0', 'f0h1', 'f1h0']))
  })
})

describe('validateGroupCoverage', () => {
  it('passes when groups partition every unit exactly once', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(() =>
      validateGroupCoverage(units, [{ unitIds: ['f0h0', 'f0h1'] }, { unitIds: ['f1h0'] }])
    ).not.toThrow()
  })

  it('throws on a unit id the AI invented', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(() =>
      validateGroupCoverage(units, [{ unitIds: ['f0h0', 'f0h1', 'f1h0', 'f9h9'] }])
    ).toThrow(/Unknown unit id/)
  })

  it('throws when a unit id is assigned to more than one group', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(() =>
      validateGroupCoverage(units, [{ unitIds: ['f0h0', 'f1h0'] }, { unitIds: ['f0h0', 'f0h1'] }])
    ).toThrow(/more than one group/)
  })

  it('throws when a unit is missing from every group', () => {
    const { units } = parseCommitDiff(TWO_FILE_DIFF)

    expect(() => validateGroupCoverage(units, [{ unitIds: ['f0h0', 'f0h1'] }])).toThrow(
      /missing units: f1h0/
    )
  })
})
