// Monaco is bundled with the app (no CDN) and only loaded when the editor opens.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import type { Theme } from '../../../shared/theme'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  }
}

// The editor only sees one file, so it can't resolve imports: keep type errors
// from lighting up every import line, but keep syntax errors.
const quietDiagnostics = { noSemanticValidation: true, noSyntaxValidation: false }
monaco.typescript.typescriptDefaults.setDiagnosticsOptions(quietDiagnostics)
monaco.typescript.javascriptDefaults.setDiagnosticsOptions(quietDiagnostics)
monaco.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.typescript.JsxEmit.Preserve,
  target: monaco.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true
})

// Dracula, to match the rest of the app (see :root in styles/base.css).
monaco.editor.defineTheme('sillygit-dracula', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'f8f8f2' },
    { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
    { token: 'string', foreground: 'f1fa8c' },
    { token: 'number', foreground: 'bd93f9' },
    { token: 'regexp', foreground: 'ff5555' },
    { token: 'keyword', foreground: 'ff79c6' },
    { token: 'type', foreground: '8be9fd', fontStyle: 'italic' },
    { token: 'type.identifier', foreground: '8be9fd' },
    { token: 'identifier', foreground: 'f8f8f2' },
    { token: 'delimiter', foreground: 'f8f8f2' },
    { token: 'tag', foreground: 'ff79c6' },
    { token: 'attribute.name', foreground: '50fa7b', fontStyle: 'italic' },
    { token: 'attribute.value', foreground: 'f1fa8c' },
    { token: 'metatag', foreground: 'ff79c6' },
    { token: 'variable', foreground: 'f8f8f2' },
    { token: 'variable.predefined', foreground: 'bd93f9' },
    { token: 'constant', foreground: 'bd93f9' },
    { token: 'key', foreground: '8be9fd' },
    { token: 'string.key.json', foreground: '8be9fd' },
    { token: 'string.value.json', foreground: 'f1fa8c' },
    { token: 'keyword.md', foreground: 'bd93f9' },
    { token: 'emphasis', fontStyle: 'italic', foreground: 'f1fa8c' },
    { token: 'strong', fontStyle: 'bold', foreground: 'ffb86c' }
  ],
  colors: {
    'editor.background': '#282a36',
    'editor.foreground': '#f8f8f2',
    'editor.lineHighlightBackground': '#44475a75',
    'editor.selectionBackground': '#44475a',
    'editor.inactiveSelectionBackground': '#44475a99',
    'editorCursor.foreground': '#f8f8f2',
    'editorLineNumber.foreground': '#6272a4',
    'editorLineNumber.activeForeground': '#f8f8f2',
    'editorIndentGuide.background1': '#44475a80',
    'editorWhitespace.foreground': '#44475a',
    'editorWidget.background': '#313343',
    'editorWidget.border': '#44475a',
    'editorSuggestWidget.background': '#313343',
    'editorSuggestWidget.selectedBackground': '#44475a',
    'editor.findMatchBackground': '#ffb86c80',
    'editor.findMatchHighlightBackground': '#ffffff40',
    'scrollbarSlider.background': '#44475a80',
    'scrollbarSlider.hoverBackground': '#6272a4a0',
    'minimap.background': '#262833'
  }
})

// The light theme's tokens (see :root[data-theme='light'] in styles/base.css).
monaco.editor.defineTheme('sillygit-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '24252f' },
    { token: 'comment', foreground: '676c89', fontStyle: 'italic' },
    { token: 'string', foreground: '8a6a00' },
    { token: 'number', foreground: '7048d8' },
    { token: 'regexp', foreground: 'd03434' },
    { token: 'keyword', foreground: 'c02f7e' },
    { token: 'type', foreground: '0a7a99', fontStyle: 'italic' },
    { token: 'type.identifier', foreground: '0a7a99' },
    { token: 'identifier', foreground: '24252f' },
    { token: 'delimiter', foreground: '24252f' },
    { token: 'tag', foreground: 'c02f7e' },
    { token: 'attribute.name', foreground: '1b8a3c', fontStyle: 'italic' },
    { token: 'attribute.value', foreground: '8a6a00' },
    { token: 'metatag', foreground: 'c02f7e' },
    { token: 'variable', foreground: '24252f' },
    { token: 'variable.predefined', foreground: '7048d8' },
    { token: 'constant', foreground: '7048d8' },
    { token: 'key', foreground: '0a7a99' },
    { token: 'string.key.json', foreground: '0a7a99' },
    { token: 'string.value.json', foreground: '8a6a00' },
    { token: 'keyword.md', foreground: '7048d8' },
    { token: 'emphasis', fontStyle: 'italic', foreground: '8a6a00' },
    { token: 'strong', fontStyle: 'bold', foreground: 'b85d00' }
  ],
  colors: {
    'editor.background': '#f7f7fa',
    'editor.foreground': '#24252f',
    'editor.lineHighlightBackground': '#e9e9f1',
    'editor.selectionBackground': '#d9cff7',
    'editor.inactiveSelectionBackground': '#d9cff799',
    'editorCursor.foreground': '#24252f',
    'editorLineNumber.foreground': '#9a9db3',
    'editorLineNumber.activeForeground': '#24252f',
    'editorIndentGuide.background1': '#d5d6e0',
    'editorWhitespace.foreground': '#c4c6d4',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#d5d6e0',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.selectedBackground': '#e9e9f1',
    'editor.findMatchBackground': '#f5c27a',
    'editor.findMatchHighlightBackground': '#f5c27a80',
    'scrollbarSlider.background': '#c4c6d480',
    'scrollbarSlider.hoverBackground': '#9a9db3a0',
    'minimap.background': '#f1f1f6'
  }
})

/** The Monaco theme for each app theme. */
export const MONACO_THEMES: Record<Theme, string> = { dark: 'sillygit-dracula', light: 'sillygit-light' }

export { monaco }
