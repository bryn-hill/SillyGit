import { Fragment, type ReactNode } from 'react'
import { highlightLine, languageForPath } from '../../lib/highlight'

// A small Markdown renderer for Claude's replies. It builds React elements
// rather than HTML, so nothing the model writes is ever injected as markup
// into a window that has the git IPC bridge. Code blocks go through Prism,
// which escapes its input.

const INLINE_RE =
  /(``[^\n]+?``|`[^`\n]+`)|(\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w))|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s\n][^*\n]*\*|(?<!\w)_[^_\s\n][^_\n]*_(?!\w))/

function openLink(url: string): void {
  if (/^https?:\/\//i.test(url)) window.api.openExternal(url)
}

function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const m = rest.match(INLINE_RE)
    if (!m || m.index === undefined) {
      out.push(rest)
      break
    }
    if (m.index > 0) out.push(rest.slice(0, m.index))
    const token = m[0]
    const key = `${keyPrefix}${i++}`
    if (m[1]) {
      // ``a `b` c`` lets a code span contain backticks; one padding space
      // on each side is dropped, as in CommonMark.
      const ticks = token.startsWith('``') ? 2 : 1
      let code = token.slice(ticks, -ticks)
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1)
      out.push(<code key={key}>{code}</code>)
    } else if (m[2]) {
      out.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>)
    } else if (m[3]) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      const label = linkMatch?.[1] ?? token
      const href = linkMatch?.[2] ?? ''
      out.push(
        <a
          key={key}
          href={href}
          title={href}
          onClick={(e) => {
            e.preventDefault()
            openLink(href)
          }}
        >
          {renderInline(label, key)}
        </a>
      )
    } else {
      out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>)
    }
    rest = rest.slice(m.index + token.length)
  }
  return out
}

function CodeBlock({ code, lang }: { code: string; lang: string }): JSX.Element {
  const language = lang ? (languageForPath(`file.${lang}`) ?? lang.toLowerCase()) : null
  return (
    <div className="md-code">
      {lang && <div className="md-code-lang">{lang}</div>}
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlightLine(code, language) }} />
      </pre>
    </div>
  )
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

export default function Markdown({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)/)
    if (fence) {
      const marker = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) body.push(lines[i++])
      i++ // closing fence (or end of a still-streaming block)
      blocks.push(<CodeBlock key={key++} code={body.join('\n')} lang={fence[2]} />)
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6)
      const Tag = `h${level}` as 'h3'
      blocks.push(<Tag key={key++}>{renderInline(heading[2])}</Tag>)
      i++
      continue
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push(<hr key={key++} />)
      i++
      continue
    }

    if (line.trimStart().startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quote.push(lines[i].trimStart().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={key++}>
          <Markdown text={quote.join('\n')} />
        </blockquote>
      )
      continue
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])
    ) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]))
      blocks.push(
        <div className="md-table-wrap" key={key++}>
          <table>
            <thead>
              <tr>
                {header.map((h, c) => (
                  <th key={c}>{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, c) => (
                    <td key={c}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    const list = line.match(LIST_RE)
    if (list) {
      const ordered = /\d/.test(list[2])
      const items: { indent: number; text: string }[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
        if (m) {
          items.push({ indent: m[1].length, text: m[3] })
          i++
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i].trim()
          i++
        } else break
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag key={key++}>
          {items.map((item, n) => (
            <li key={n} style={item.indent ? { marginLeft: Math.min(item.indent, 8) * 8 } : undefined}>
              {renderInline(item.text)}
            </li>
          ))}
        </ListTag>
      )
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !LIST_RE.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>')
    ) {
      para.push(lines[i++])
    }
    if (para.length === 0) para.push(lines[i++])
    blocks.push(
      <p key={key++}>
        {para.map((l, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {renderInline(l, `${n}-`)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="md">{blocks}</div>
}
