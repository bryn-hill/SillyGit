import { describe, expect, it } from 'vitest'
import {
  chosenEditor,
  customEditorArgs,
  editorArgs,
  editorPreset,
  normalizeEditorSettings,
  type InstalledEditor
} from './editors'

const vscode: InstalledEditor = { id: 'vscode', name: 'Visual Studio Code', short: 'VS Code' }
const zed: InstalledEditor = { id: 'zed', name: 'Zed', short: 'Zed' }

describe('normalizeEditorSettings', () => {
  it('keeps a known editor and the custom command', () => {
    expect(normalizeEditorSettings({ editor: 'zed', customCommand: 'x' })).toEqual({ editor: 'zed', customCommand: 'x' })
    expect(normalizeEditorSettings({ editor: 'custom' })).toEqual({ editor: 'custom', customCommand: '' })
  })

  it('drops an unknown editor', () => {
    expect(normalizeEditorSettings({ editor: 'notepad' as never })).toEqual({ editor: null, customCommand: '' })
    expect(normalizeEditorSettings(undefined)).toEqual({ editor: null, customCommand: '' })
  })
})

describe('chosenEditor', () => {
  it('uses the picked editor when it is installed', () => {
    expect(chosenEditor({ editor: 'zed', customCommand: '' }, [vscode, zed])).toBe(zed)
  })

  it('falls back to the first one found', () => {
    expect(chosenEditor({ editor: null, customCommand: '' }, [vscode, zed])).toBe(vscode)
    expect(chosenEditor({ editor: 'cursor', customCommand: '' }, [vscode, zed])).toBe(vscode)
    expect(chosenEditor({ editor: null, customCommand: '' }, [])).toBeNull()
  })

  it('names a custom command after its program', () => {
    expect(chosenEditor({ editor: 'custom', customCommand: '/usr/local/bin/nvim-qt $PATH' }, [vscode])).toEqual({
      id: 'custom',
      name: 'nvim-qt',
      short: 'nvim-qt'
    })
    // An empty command falls back like an editor that isn't there.
    expect(chosenEditor({ editor: 'custom', customCommand: ' ' }, [vscode])).toBe(vscode)
  })
})

describe('editorArgs', () => {
  it('opens the repo on its own', () => {
    expect(editorArgs(editorPreset('vscode')!, '/r')).toEqual(['/r'])
    expect(editorArgs(editorPreset('webstorm')!, '/r')).toEqual(['/r'])
  })

  it("shows a file in the repo's window where the editor can", () => {
    expect(editorArgs(editorPreset('cursor')!, '/r', '/r/a b.ts')).toEqual(['/r', '--goto', '/r/a b.ts'])
    expect(editorArgs(editorPreset('zed')!, '/r', '/r/a.ts')).toEqual(['/r', '/r/a.ts'])
    expect(editorArgs(editorPreset('intellij')!, '/r', '/r/a.ts')).toEqual(['/r/a.ts'])
  })
})

describe('customEditorArgs', () => {
  it('fills in the placeholders inside words', () => {
    expect(customEditorArgs('ed --root=$REPO "$FILE"', '/my repo', '/my repo/a.ts')).toEqual({
      program: 'ed',
      args: ['--root=/my repo', '/my repo/a.ts']
    })
    expect(customEditorArgs('ed ${PATH}', '/r')).toEqual({ program: 'ed', args: ['/r'] })
  })

  it('adds the path when the command has no placeholder', () => {
    expect(customEditorArgs('open -a Nova', '/r', '/r/x')).toEqual({ program: 'open', args: ['-a', 'Nova', '/r/x'] })
  })

  it('refuses an empty command', () => {
    expect(() => customEditorArgs('  ', '/r')).toThrow()
  })
})
