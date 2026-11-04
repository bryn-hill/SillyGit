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

// -- Extra tokens for the JavaScript family, so code reads like VS Code's Dracula --

const SCRIPT_LANGUAGES = ['javascript', 'jsx', 'typescript', 'tsx']

// Prism leaves `Record`, `Map` and generic `T` as plain text or constants; colour them as types.
for (const lang of SCRIPT_LANGUAGES) {
  Prism.languages.insertBefore(lang, 'constant', {
    'type-name': {
      pattern: /\b(?:[A-Z][a-z]\w*|[A-Z])\b/,
      alias: 'class-name'
    }
  })
}

// Keywords that are really values, coloured like other constants.
const VALUE_KEYWORDS = new Set(['null', 'undefined', 'NaN', 'Infinity'])

type Stream = Array<string | Prism.Token>

/** Splits plain text into identifiers and the rest, so each name can become a token. */
function splitPlain(stream: Stream): Stream {
  const out: Stream = []
  for (const item of stream) {
    if (typeof item !== 'string') {
      out.push(item)
      continue
    }
    for (const piece of item.split(/([A-Za-z_$][\w$]*)/)) if (piece) out.push(piece)
  }
  return out
}

const isName = (item: string | Prism.Token | undefined): item is string =>
  typeof item === 'string' && /^[A-Za-z_$][\w$]*$/.test(item)

/** The text of punctuation, operators and keywords; null for anything else. */
function symbolOf(item: string | Prism.Token | undefined): string | null {
  if (item == null || typeof item === 'string') return null
  if (item.type === 'punctuation' || item.type === 'operator' || item.type === 'keyword') {
    return typeof item.content === 'string' ? item.content : null
  }
  return null
}

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/**
 * Marks function parameters (and their uses inside the function) as `parameter` tokens, which
 * Prism's TypeScript grammar doesn't do. A heuristic over the top-level tokens: a bracketed list
 * is a parameter list when an arrow, a body or a return type follows it.
 */
function markParameters(input: Stream): Stream {
  const items = splitPlain(input)
  // Indexes of everything but whitespace.
  const sig: number[] = []
  items.forEach((item, i) => {
    if (typeof item !== 'string' || item.trim() !== '') sig.push(i)
  })
  const at = (s: number): string | Prism.Token | undefined => items[sig[s]]
  const sym = (s: number): string | null => symbolOf(at(s))

  /** The sig index of the bracket closing the one at `s`, or -1. */
  const closeOf = (s: number): number => {
    const open = sym(s)
    const close = open ? OPENERS[open] : undefined
    if (!close) return -1
    let depth = 0
    for (let j = s; j < sig.length; j++) {
      const t = sym(j)
      if (t === open) depth++
      else if (t === close && --depth === 0) return j
    }
    return -1
  }

  const mark = (s: number): void => {
    items[sig[s]] = new Prism.Token('parameter', items[sig[s]] as string)
  }

  /** Marks uses of `names` from sig index `from` up to `to` (exclusive). */
  const markUses = (names: Set<string>, from: number, to: number): void => {
    for (let j = from; j < to; j++) {
      const item = at(j)
      if (!isName(item) || !names.has(item)) continue
      const prev = sym(j - 1)
      if (prev === '.' || prev === '?.') continue
      // An object key like `{ name: value }`.
      if (sym(j + 1) === ':' && (prev === '{' || prev === ',')) continue
      mark(j)
    }
  }

  /** Where an arrow function's body ends: its closing brace, or the end of its expression. */
  const bodyEnd = (s: number): number => {
    if (sym(s) === '{') return closeOf(s)
    let depth = 0
    for (let j = s; j < sig.length; j++) {
      const t = sym(j)
      if (t && OPENERS[t]) depth++
      else if (t === ')' || t === ']' || t === '}') {
        if (depth === 0) return j
        depth--
      } else if (depth === 0 && (t === ';' || t === ',')) return j
    }
    return sig.length
  }

  /** Skips a return type after `:`, giving the sig index of the arrow or body brace, or -1. */
  const afterReturnType = (s: number): number => {
    for (let j = s; j < sig.length; j++) {
      const t = sym(j)
      if (t === '=>') return j
      if (t === '{') {
        const prev = sym(j - 1)
        // `{` straight after `:`, `|` and so on is an object type, not the body.
        if (prev === ':' || prev === '|' || prev === '&' || prev === ',' || prev === '<') {
          const end = closeOf(j)
          if (end < 0) return -1
          j = end
          continue
        }
        return j
      }
      if (t === '<' || t === '(' || t === '[') {
        // Skip generics and tuple or function types.
        let depth = 0
        const open = t
        const close = t === '<' ? '>' : OPENERS[t]
        for (; j < sig.length; j++) {
          const u = sym(j)
          if (u === open) depth++
          else if (u === close && --depth === 0) break
          else if (open === '<' && u === '>>') {
            depth -= 2
            if (depth <= 0) break
          }
        }
        continue
      }
      if (t === ';' || t === '=') return -1
    }
    return -1
  }

  const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'typeof', 'await', 'in', 'of'])

  for (let s = 0; s < sig.length; s++) {
    const item = at(s)

    // `x => ...`
    if (isName(item) && sym(s + 1) === '=>' && sym(s - 1) !== '.') {
      mark(s)
      const end = bodyEnd(s + 2)
      markUses(new Set([item]), s + 2, end)
      continue
    }

    if (sym(s) !== '(') continue
    const prevItem = at(s - 1)
    const prev = sym(s - 1)
    if (prev && CONTROL.has(prev)) continue
    const close = closeOf(s)
    if (close < 0) continue

    const next = sym(close + 1)
    const prevIsFunction =
      prevItem != null &&
      typeof prevItem !== 'string' &&
      (prevItem.type === 'function' || prevItem.type === 'generic-function')
    const declared = prev === 'function' || (prevIsFunction && sym(s - 2) === 'function')
    let bodyStart = -1
    if (next === '=>') bodyStart = close + 2
    else if (next === '{' && (prevIsFunction || prev === 'function')) bodyStart = close + 1
    else if (
      next === ':' &&
      (declared || prevIsFunction || prev === '=' || prev === '(' || prev === ',' || prev === 'async')
    ) {
      const after = afterReturnType(close + 2)
      if (after < 0) continue
      bodyStart = sym(after) === '=>' ? after + 1 : after
    } else continue

    // Names at the top of the list: after `(`, `,` or `...`, before `:`, `?`, `,`, `)` or `=`.
    const names = new Set<string>()
    let depth = 0
    for (let j = s + 1; j < close; j++) {
      const t = sym(j)
      if (t && OPENERS[t]) depth++
      else if (t === ')' || t === ']' || t === '}') depth--
      else if (t === '<') depth++
      else if (t === '>') depth--
      const name = at(j)
      if (depth !== 0 || !isName(name)) continue
      const before = sym(j - 1)
      const after = sym(j + 1)
      if (
        (j === s + 1 || before === ',' || before === '...') &&
        (after === ':' || after === '?' || after === ',' || after === '=' || j + 1 === close)
      ) {
        names.add(name)
        mark(j)
      }
    }
    if (names.size > 0 && bodyStart < sig.length) markUses(names, bodyStart, bodyEnd(bodyStart))
  }
  return items
}

/**
 * Gives keywords Dracula colours by word: `null` and `undefined` are language constants,
 * `this` and `super` language variables, and `new` is bold. Nested streams are left to Prism.
 */
function markKeywords(stream: Stream): void {
  for (const item of stream) {
    if (typeof item === 'string' || item.type !== 'keyword' || typeof item.content !== 'string') continue
    if (VALUE_KEYWORDS.has(item.content)) item.type = 'language-constant'
    else if (item.content === 'this' || item.content === 'super') item.alias = 'language-variable'
    else if (item.content === 'new') item.alias = 'keyword-new'
  }
}

function tokenize(text: string, lang: string): Stream {
  const tokens = Prism.tokenize(text, Prism.languages[lang]) as Stream
  if (!SCRIPT_LANGUAGES.includes(lang)) return tokens
  markKeywords(tokens)
  return markParameters(tokens)
}

function tokenClasses(token: Prism.Token): string {
  const aliases = token.alias == null ? [] : Array.isArray(token.alias) ? token.alias : [token.alias]
  return ['token', token.type, ...aliases].join(' ')
}

/** Turns a token stream into HTML, one string per line, closing and reopening spans at line breaks. */
function streamToLines(stream: Prism.TokenStream): string[] {
  const lines: string[] = []
  const open: string[] = []
  let current = ''
  const walk = (s: Prism.TokenStream): void => {
    if (typeof s === 'string') {
      s.split('\n').forEach((part, i) => {
        if (i > 0) {
          lines.push(current + '</span>'.repeat(open.length))
          current = open.map((c) => `<span class="${c}">`).join('')
        }
        current += escapeHtml(part)
      })
      return
    }
    if (Array.isArray(s)) {
      for (const item of s) walk(item)
      return
    }
    const classes = tokenClasses(s)
    open.push(classes)
    current += `<span class="${classes}">`
    walk(s.content)
    open.pop()
    current += '</span>'
  }
  walk(stream)
  lines.push(current)
  return lines
}

function syntaxLines(text: string, lang: string | null): string[] {
  if (!lang || !Prism.languages[lang]) return text.split('\n').map(escapeHtml)
  try {
    return streamToLines(tokenize(text, lang))
  } catch {
    return text.split('\n').map(escapeHtml)
  }
}

/**
 * Syntax-highlighted HTML (Prism `token` spans) for one line of code, or escaped plain text if
 * `lang` isn't recognized, with any changed-word `ranges` marked on top.
 */
export function highlightLine(text: string, lang: string | null, ranges?: readonly WordRange[] | null): string {
  const html = syntaxLines(text, lang).join('\n')
  return ranges && ranges.length > 0 ? markWords(html, ranges) : html
}

/**
 * Highlights a whole file at once and returns one HTML string per line, so tokens that span
 * lines (block comments, template strings) keep their colour on every line.
 */
export function highlightLines(text: string, lang: string | null): string[] {
  return syntaxLines(text, lang)
}
