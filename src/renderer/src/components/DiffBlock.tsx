import { useEffect, useRef, type JSX } from 'react'

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

  // Number the new-file side of each hunk as we go.
  const rendered: Array<{ line: string; cls: string; lineNum: number | undefined; key: number }> = []
  let newLineNum = 0
  let inHunk = false
  lines.forEach((line, i) => {
    const cls = lineClass(line)
    let lineNum: number | undefined
    const hunkMatch = cls === 'diff-hunk-header' && line.match(HUNK_HEADER_RE)
    if (line.startsWith('diff --git ')) {
      inHunk = false
    } else if (hunkMatch) {
      inHunk = true
      newLineNum = Number(hunkMatch[1])
    } else if (inHunk && (cls === 'diff-add' || cls === 'diff-context')) {
      lineNum = newLineNum
      newLineNum += 1
    }
    rendered.push({ line, cls, lineNum, key: i })
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
