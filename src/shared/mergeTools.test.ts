import { describe, expect, it } from 'vitest'
import {
  buildMergeToolArgs,
  MERGE_TOOL_PRESETS,
  mergeToolName,
  normalizeMergeToolSettings,
  splitCommand
} from './mergeTools'

const files = { LOCAL: '/t/a.LOCAL.ts', REMOTE: '/t/a.REMOTE.ts', BASE: '/t/a.BASE.ts', MERGED: '/repo/my file.ts' }

describe('splitCommand', () => {
  it('splits on whitespace and honours quotes and backslashes', () => {
    expect(splitCommand(`tool  -a "two words" 'single "q"' back\\ slash ""`)).toEqual([
      'tool',
      '-a',
      'two words',
      'single "q"',
      'back slash',
      ''
    ])
  })

  it('handles escaped quotes inside double quotes', () => {
    expect(splitCommand('echo "say \\"hi\\""')).toEqual(['echo', 'say "hi"'])
  })
})

describe('buildMergeToolArgs', () => {
  it('substitutes placeholders inside words, keeping paths with spaces as one argument', () => {
    expect(buildMergeToolArgs('bcomp $LOCAL $REMOTE ${BASE} -mergeoutput=$MERGED', files)).toEqual({
      program: 'bcomp',
      args: ['/t/a.LOCAL.ts', '/t/a.REMOTE.ts', '/t/a.BASE.ts', '-mergeoutput=/repo/my file.ts']
    })
  })

  it('never interprets shell syntax in a path', () => {
    const evil = { ...files, MERGED: '/repo/$(rm -rf ~); `x`.ts' }
    expect(buildMergeToolArgs('tool $MERGED', evil).args).toEqual(['/repo/$(rm -rf ~); `x`.ts'])
  })

  it('every preset with a command uses $MERGED', () => {
    for (const p of MERGE_TOOL_PRESETS.filter((p) => p.command)) expect(p.command).toContain('$MERGED')
  })

  it('rejects an empty command', () => {
    expect(() => buildMergeToolArgs('   ', files)).toThrow('no merge tool')
  })
})

describe('settings', () => {
  it('normalises unknown values to the built-in tool', () => {
    expect(normalizeMergeToolSettings(undefined)).toEqual({ tool: 'none', customCommand: '' })
    expect(normalizeMergeToolSettings({ tool: 'emacs' as never, customCommand: 3 as never })).toEqual({
      tool: 'none',
      customCommand: ''
    })
  })

  it('names the tool for "Open in …"', () => {
    expect(mergeToolName({ tool: 'none', customCommand: '' })).toBeNull()
    expect(mergeToolName({ tool: 'vscode', customCommand: '' })).toBe('VS Code')
    expect(mergeToolName({ tool: 'custom', customCommand: '"/opt/My Tools/diffy" $MERGED' })).toBe('diffy')
    expect(mergeToolName({ tool: 'custom', customCommand: '' })).toBeNull()
  })
})
