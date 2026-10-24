import { useEffect, useRef } from 'react'

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-file-header'
  if (line.startsWith('@@')) return 'diff-hunk-header'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-remove'
  return 'diff-context'
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

interface Props {
  diffText: string
  highlightLine?: number
}

export default function DiffBlock({ diffText, highlightLine }: Props): JSX.Element {
  const containerRef = useRef<HTMLPreElement>(null)
  const lines = diffText.split('\n')

  let newLineNum = 0
  let inHunk = false
  const rendered = lines.map((line, i) => {
    const cls = lineClass(line)
    if (line.startsWith('diff --git ')) {
      inHunk = false
      return { line, cls, lineNum: undefined, key: i }
    }
    const hunkMatch = cls === 'diff-hunk-header' && line.match(HUNK_HEADER_RE)
    if (hunkMatch) {
      inHunk = true
      newLineNum = Number(hunkMatch[1])
      return { line, cls, lineNum: undefined, key: i }
    }
    if (!inHunk || (cls !== 'diff-add' && cls !== 'diff-context')) {
      return { line, cls, lineNum: undefined, key: i }
    }
    const lineNum = newLineNum
    newLineNum += 1
    return { line, cls, lineNum, key: i }
  })

  useEffect(() => {
    if (highlightLine == null) return
    containerRef.current
      ?.querySelector('.diff-highlight')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [diffText, highlightLine])

  return (
    <pre className="diff-content" ref={containerRef}>
      {rendered.map(({ line, cls, lineNum, key }) => (
        <div
          key={key}
          className={lineNum != null && lineNum === highlightLine ? `${cls} diff-highlight` : cls}
        >
          {line.length === 0 ? ' ' : line}
        </div>
      ))}
    </pre>
  )
}
