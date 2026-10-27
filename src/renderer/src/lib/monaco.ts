// Monaco is bundled with the app (no CDN) and only loaded when the editor opens.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

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

// Dracula, to match the rest of the app (see :root in styles.css).
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

export { monaco }
