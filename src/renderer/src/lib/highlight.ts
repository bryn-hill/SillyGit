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
import type { WordRange } from '../../../shared/wordDiff'

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

/**
 * Wraps the text inside `ranges` (character offsets into the unescaped text, sorted and
 * non-overlapping) in `diff-word` marks. Marks close before every tag and reopen after it,
 * so they never straddle the syntax-token spans.
 */
function markWords(html: string, ranges: readonly WordRange[]): string {
  let out = ''
  let offset = 0
  let r = 0
  let open = false
  let i = 0
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i) + 1 || html.length
      if (open) out += '</mark>'
      open = false
      out += html.slice(i, end)
      i = end
      continue
    }
    // An entity like &lt; is one character of text.
    const entityEnd = html[i] === '&' ? html.indexOf(';', i) + 1 : 0
    const end = entityEnd > 0 ? entityEnd : i + 1
    while (r < ranges.length && ranges[r][1] <= offset) r++
    const inside = r < ranges.length && ranges[r][0] <= offset
    if (inside && !open) out += '<mark class="diff-word">'
    if (!inside && open) out += '</mark>'
    open = inside
    out += html.slice(i, end)
    offset++
    i = end
  }
  if (open) out += '</mark>'
  return out
}

function syntaxHtml(text: string, lang: string | null): string {
  if (!lang || !Prism.languages[lang]) return escapeHtml(text)
  try {
    return Prism.highlight(text, Prism.languages[lang], lang)
  } catch {
    return escapeHtml(text)
  }
}

/**
 * Syntax-highlighted HTML (Prism `token` spans) for one line of code, or escaped plain text if
 * `lang` isn't recognized, with any changed-word `ranges` marked on top.
 */
export function highlightLine(text: string, lang: string | null, ranges?: readonly WordRange[] | null): string {
  const html = syntaxHtml(text, lang)
  return ranges && ranges.length > 0 ? markWords(html, ranges) : html
}
