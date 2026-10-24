import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'

const EXTENSION_LANGUAGE: Record<string, string> = {
  css: 'css',
  scss: 'scss',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown'
}

export function languageForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return null
  const lang = EXTENSION_LANGUAGE[ext]
  return lang && Prism.languages[lang] ? lang : null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Syntax-highlighted HTML (Prism `token` spans) for one line of code, or escaped plain text if `lang` isn't recognized. */
export function highlightLine(text: string, lang: string | null): string {
  if (!lang || !Prism.languages[lang]) return escapeHtml(text)
  try {
    return Prism.highlight(text, Prism.languages[lang], lang)
  } catch {
    return escapeHtml(text)
  }
}
